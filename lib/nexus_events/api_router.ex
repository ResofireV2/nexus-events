defmodule NexusEvents.ApiRouter do
  @moduledoc """
  API router for the Nexus Events extension.

  Mounted via routes/0 in NexusEvents with prefix "/".
  The Nexus Phoenix router pattern /:slug/api/*path consumes the "api"
  segment, so path_info arriving here is already stripped of that prefix.

  The extension_api pipeline runs LoadUser before reaching this plug,
  so conn.assigns[:current_user] is either a user struct (integer id)
  or nil for unauthenticated requests.

  Response pattern per guide §8.6:
    send_resp(conn, status_code, Jason.encode!(map))

  Permission checks use Nexus.Extensions.Permissions.check/3 which
  returns :ok or :error.

  Body params for POST/PATCH: conn.body_params (populated by
  Plug.Parsers at the endpoint level before reaching this plug).
  """

  use Plug.Router

  import Plug.Conn
  alias Nexus.Extensions.Permissions
  alias Nexus.Notifications
  alias NexusEvents.Events

  plug :match
  plug :dispatch

  @slug "nexus-events"

  # ---------------------------------------------------------------------------
  # GET /events?filter=upcoming|past
  # ---------------------------------------------------------------------------

  get "/events" do
    case Permissions.check(@slug, "can_view_events", conn.assigns[:current_user]) do
      :error ->
        send_resp(conn, 403, Jason.encode!(%{error: "Access denied"}))

      :ok ->
        filter = conn.query_params["filter"] || "upcoming"
        ext    = Nexus.Extensions.get_extension_by_slug(@slug)
        limit  = get_in(ext, [Access.key(:settings), "events_per_page"]) || 20

        events = Events.list_events(filter, limit)

        send_resp(conn, 200, Jason.encode!(%{
          events: Enum.map(events, &event_json/1),
          filter: filter
        }))
    end
  end

  # ---------------------------------------------------------------------------
  # POST /events
  # ---------------------------------------------------------------------------

  post "/events" do
    user = conn.assigns[:current_user]

    case Permissions.check(@slug, "can_create_event", user) do
      :error ->
        send_resp(conn, 403, Jason.encode!(%{error: "Access denied"}))

      :ok ->
        # Merge creator_user_id from the authenticated user.
        # user.id is an integer; we store creator_user_id as a string.
        attrs = Map.put(conn.body_params, "creator_user_id", to_string(user.id))

        case Events.create_event(attrs) do
          {:ok, event} ->
            send_resp(conn, 201, Jason.encode!(%{event: event_json(event)}))

          {:error, changeset} ->
            send_resp(conn, 422, Jason.encode!(%{errors: format_errors(changeset)}))
        end
    end
  end

  # ---------------------------------------------------------------------------
  # GET /events/:id
  # ---------------------------------------------------------------------------

  get "/events/:id" do
    case Permissions.check(@slug, "can_view_events", conn.assigns[:current_user]) do
      :error ->
        send_resp(conn, 403, Jason.encode!(%{error: "Access denied"}))

      :ok ->
        case Events.get_event(id) do
          nil ->
            send_resp(conn, 404, Jason.encode!(%{error: "Event not found"}))

          event ->
            counts    = Events.rsvp_counts(event.id)
            user_rsvp =
              case conn.assigns[:current_user] do
                nil  -> nil
                user -> Events.get_rsvp(event.id, to_string(user.id))
              end

            send_resp(conn, 200, Jason.encode!(%{
              event:      event_json(event),
              rsvp_counts: counts,
              user_rsvp:  user_rsvp && %{response: user_rsvp.response}
            }))
        end
    end
  end

  # ---------------------------------------------------------------------------
  # PATCH /events/:id
  # ---------------------------------------------------------------------------

  patch "/events/:id" do
    user = conn.assigns[:current_user]

    with :auth     <- check_auth(user),
         {:event, event} when not is_nil(event) <- {:event, Events.get_event(id)},
         :can_edit  <- check_can_edit(user, event) do
      case Events.update_event(event, conn.body_params) do
        {:ok, updated} ->
          send_resp(conn, 200, Jason.encode!(%{event: event_json(updated)}))

        {:error, changeset} ->
          send_resp(conn, 422, Jason.encode!(%{errors: format_errors(changeset)}))
      end
    else
      :unauthorized ->
        send_resp(conn, 401, Jason.encode!(%{error: "Login required"}))

      {:event, nil} ->
        send_resp(conn, 404, Jason.encode!(%{error: "Event not found"}))

      :forbidden ->
        send_resp(conn, 403, Jason.encode!(%{error: "Access denied"}))
    end
  end

  # ---------------------------------------------------------------------------
  # DELETE /events/:id
  # ---------------------------------------------------------------------------

  delete "/events/:id" do
    user = conn.assigns[:current_user]

    with :auth     <- check_auth(user),
         {:event, event} when not is_nil(event) <- {:event, Events.get_event(id)},
         :can_delete <- check_can_delete(user, event) do
      case Events.delete_event(event) do
        {:ok, _} ->
          send_resp(conn, 200, Jason.encode!(%{ok: true}))

        {:error, _changeset} ->
          send_resp(conn, 500, Jason.encode!(%{error: "Could not delete event"}))
      end
    else
      :unauthorized ->
        send_resp(conn, 401, Jason.encode!(%{error: "Login required"}))

      {:event, nil} ->
        send_resp(conn, 404, Jason.encode!(%{error: "Event not found"}))

      :forbidden ->
        send_resp(conn, 403, Jason.encode!(%{error: "Access denied"}))
    end
  end

  # ---------------------------------------------------------------------------
  # POST /events/:id/cancel
  # Cancels the event and sends event_cancelled notifications to all RSVPs.
  # ---------------------------------------------------------------------------

  post "/events/:id/cancel" do
    user = conn.assigns[:current_user]

    case Permissions.check(@slug, "can_cancel_event", user) do
      :error ->
        send_resp(conn, 403, Jason.encode!(%{error: "Access denied"}))

      :ok ->
        case Events.get_event(id) do
          nil ->
            send_resp(conn, 404, Jason.encode!(%{error: "Event not found"}))

          %{status: "cancelled"} = _event ->
            send_resp(conn, 422, Jason.encode!(%{error: "Event is already cancelled"}))

          event ->
            case Events.cancel_event(event) do
              {:ok, cancelled} ->
                # Notify all RSVPed users. Each needs their own notification row.
                # rsvp.user_id is stored as string; notifications.user_id is integer.
                # payload_schema requires event_id and event_title.
                attendees = Events.list_attendees(cancelled.id)

                Task.start(fn ->
                  Enum.each(attendees, fn %{user_id: uid} ->
                    Notifications.notify_extension(
                      @slug,
                      "event_cancelled",
                      user_id: String.to_integer(uid),
                      data: %{
                        "event_id"    => to_string(cancelled.id),
                        "event_title" => cancelled.title
                      }
                    )
                  end)
                end)

                send_resp(conn, 200, Jason.encode!(%{event: event_json(cancelled)}))

              {:error, changeset} ->
                send_resp(conn, 422, Jason.encode!(%{errors: format_errors(changeset)}))
            end
        end
    end
  end

  # ---------------------------------------------------------------------------
  # GET /posts/:post_id/event
  # ---------------------------------------------------------------------------

  get "/posts/:post_id/event" do
    case Permissions.check(@slug, "can_view_events", conn.assigns[:current_user]) do
      :error ->
        send_resp(conn, 403, Jason.encode!(%{error: "Access denied"}))

      :ok ->
        case Events.get_event_for_post(post_id) do
          nil ->
            send_resp(conn, 200, Jason.encode!(%{event: nil}))

          event ->
            counts    = Events.rsvp_counts(event.id)
            user_rsvp =
              case conn.assigns[:current_user] do
                nil  -> nil
                user -> Events.get_rsvp(event.id, to_string(user.id))
              end

            send_resp(conn, 200, Jason.encode!(%{
              event:       event_json(event),
              rsvp_counts: counts,
              user_rsvp:   user_rsvp && %{response: user_rsvp.response}
            }))
        end
    end
  end

  # ---------------------------------------------------------------------------
  # POST /events/:id/rsvp
  # Body: {"response": "attending" | "maybe"}
  # ---------------------------------------------------------------------------

  post "/events/:id/rsvp" do
    user = conn.assigns[:current_user]

    case Permissions.check(@slug, "can_rsvp", user) do
      :error ->
        send_resp(conn, 403, Jason.encode!(%{error: "Access denied"}))

      :ok ->
        case Events.get_event(id) do
          nil ->
            send_resp(conn, 404, Jason.encode!(%{error: "Event not found"}))

          %{status: "cancelled"} ->
            send_resp(conn, 422, Jason.encode!(%{error: "Cannot RSVP to a cancelled event"}))

          event ->
            # Check per-event rsvp_enabled flag.
            if not event.rsvp_enabled do
              send_resp(conn, 422, Jason.encode!(%{error: "RSVP is disabled for this event"}))
            else
              # Check global rsvp_enabled setting.
              ext = Nexus.Extensions.get_extension_by_slug(@slug)
              global_rsvp = get_in(ext, [Access.key(:settings), "rsvp_enabled"])
              global_rsvp = if is_nil(global_rsvp), do: true, else: global_rsvp

              if not global_rsvp do
                send_resp(conn, 422, Jason.encode!(%{error: "RSVP is disabled"}))
              else
                # Check RSVP cap. max_rsvp=0 means unlimited.
                at_cap =
                  event.max_rsvp > 0 and
                  Events.rsvp_counts(event.id).attending >= event.max_rsvp and
                  Events.get_rsvp(event.id, to_string(user.id)) == nil

                if at_cap do
                  send_resp(conn, 422, Jason.encode!(%{error: "Event is at capacity"}))
                else
                  response = conn.body_params["response"] || "attending"

                  case Events.upsert_rsvp(event.id, to_string(user.id), response) do
                    {:ok, rsvp} ->
                      counts = Events.rsvp_counts(event.id)
                      send_resp(conn, 200, Jason.encode!(%{
                        rsvp:        %{response: rsvp.response},
                        rsvp_counts: counts
                      }))

                    {:error, changeset} ->
                      send_resp(conn, 422, Jason.encode!(%{errors: format_errors(changeset)}))
                  end
                end
              end
            end
        end
    end
  end

  # ---------------------------------------------------------------------------
  # DELETE /events/:id/rsvp
  # ---------------------------------------------------------------------------

  delete "/events/:id/rsvp" do
    user = conn.assigns[:current_user]

    case Permissions.check(@slug, "can_rsvp", user) do
      :error ->
        send_resp(conn, 403, Jason.encode!(%{error: "Access denied"}))

      :ok ->
        case Events.get_event(id) do
          nil ->
            send_resp(conn, 404, Jason.encode!(%{error: "Event not found"}))

          event ->
            case Events.delete_rsvp(event.id, to_string(user.id)) do
              {:ok, _} ->
                counts = Events.rsvp_counts(event.id)
                send_resp(conn, 200, Jason.encode!(%{ok: true, rsvp_counts: counts}))

              {:error, :not_found} ->
                send_resp(conn, 404, Jason.encode!(%{error: "No RSVP found"}))

              {:error, _} ->
                send_resp(conn, 500, Jason.encode!(%{error: "Could not remove RSVP"}))
            end
        end
    end
  end

  # ---------------------------------------------------------------------------
  # GET /events/:id/attendees
  # ---------------------------------------------------------------------------

  get "/events/:id/attendees" do
    case Permissions.check(@slug, "can_view_attendees", conn.assigns[:current_user]) do
      :error ->
        send_resp(conn, 403, Jason.encode!(%{error: "Access denied"}))

      :ok ->
        case Events.get_event(id) do
          nil ->
            send_resp(conn, 404, Jason.encode!(%{error: "Event not found"}))

          event ->
            attendees = Events.list_attendees(event.id)
            send_resp(conn, 200, Jason.encode!(%{attendees: attendees}))
        end
    end
  end

  # ---------------------------------------------------------------------------
  # GET /permissions
  # ---------------------------------------------------------------------------

  get "/permissions" do
    user = conn.assigns[:current_user]

    permission_keys = [
      "can_view_events",
      "can_create_event",
      "can_rsvp",
      "can_view_attendees",
      "can_edit_any_event",
      "can_cancel_event",
      "can_delete_any_event",
      "can_manage_events"
    ]

    resolved =
      Map.new(permission_keys, fn key ->
        {key, Permissions.check(@slug, key, user) == :ok}
      end)

    send_resp(conn, 200, Jason.encode!(%{permissions: resolved}))
  end

  # ---------------------------------------------------------------------------
  # Catch-all
  # ---------------------------------------------------------------------------

  match _ do
    send_resp(conn, 404, Jason.encode!(%{error: "Not found"}))
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  # Checks that a user is logged in at all.
  defp check_auth(nil),  do: :unauthorized
  defp check_auth(_user), do: :auth

  # Can edit if: creator of the event, OR has can_edit_any_event permission.
  # user.id is integer; event.creator_user_id is stored as string.
  defp check_can_edit(user, event) do
    is_creator = to_string(user.id) == event.creator_user_id
    has_perm   = Permissions.check(@slug, "can_edit_any_event", user) == :ok

    if is_creator or has_perm, do: :can_edit, else: :forbidden
  end

  # Can delete if: creator of the event, OR has can_delete_any_event permission.
  defp check_can_delete(user, event) do
    is_creator = to_string(user.id) == event.creator_user_id
    has_perm   = Permissions.check(@slug, "can_delete_any_event", user) == :ok

    if is_creator or has_perm, do: :can_delete, else: :forbidden
  end

  defp event_json(event) do
    %{
      id:              event.id,
      post_id:         event.post_id,
      title:           event.title,
      description:     event.description,
      image_url:       event.image_url,
      location:        event.location,
      start_at:        format_datetime(event.start_at),
      end_at:          format_datetime(event.end_at),
      status:          event.status,
      rsvp_enabled:    event.rsvp_enabled,
      max_rsvp:        event.max_rsvp,
      creator_user_id: event.creator_user_id,
      inserted_at:     format_datetime(event.inserted_at),
      updated_at:      format_datetime(event.updated_at)
    }
  end

  # Ecto loads :utc_datetime columns as NaiveDateTime (no tz info).
  # Convert to UTC DateTime for consistent ISO 8601 output.
  defp format_datetime(nil), do: nil
  defp format_datetime(%DateTime{} = dt),
    do: DateTime.to_iso8601(dt)
  defp format_datetime(%NaiveDateTime{} = ndt),
    do: ndt |> DateTime.from_naive!("Etc/UTC") |> DateTime.to_iso8601()

  defp format_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Enum.reduce(opts, msg, fn {k, v}, acc ->
        String.replace(acc, "%{#{k}}", if(is_binary(v), do: v, else: inspect(v)))
      end)
    end)
  end
end
