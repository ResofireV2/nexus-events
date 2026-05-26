defmodule NexusEvents.ApiRouter do
  @moduledoc """
  API router for the Nexus Events extension.

  Mounted at /ext/nexus-events/api/... via routes/0 in NexusEvents.
  The extension_api pipeline in Nexus's router runs LoadUser before
  reaching this plug, so conn.assigns.current_user is either a user
  struct or nil for unauthenticated requests.

  Response pattern (per guide §8.6 and the foundation smoke test example):
    send_resp(conn, status_code, Jason.encode!(map))

  Permission checks use Nexus.Extensions.Permissions.check/3 which
  returns :ok or :error.
  """

  use Plug.Router

  import Plug.Conn
  alias Nexus.Extensions.Permissions
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
            counts = Events.rsvp_counts(event.id)

            user_rsvp =
              case conn.assigns[:current_user] do
                nil  -> nil
                user -> Events.get_rsvp(event.id, to_string(user.id))
              end

            send_resp(conn, 200, Jason.encode!(%{
              event: event_json(event),
              rsvp_counts: counts,
              user_rsvp: user_rsvp && %{response: user_rsvp.response}
            }))
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
            counts = Events.rsvp_counts(event.id)

            user_rsvp =
              case conn.assigns[:current_user] do
                nil  -> nil
                user -> Events.get_rsvp(event.id, to_string(user.id))
              end

            send_resp(conn, 200, Jason.encode!(%{
              event: event_json(event),
              rsvp_counts: counts,
              user_rsvp: user_rsvp && %{response: user_rsvp.response}
            }))
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
  # Returns the resolved permission tiers for the current user.
  # Used by the JS bundle to gate UI elements client-side.
  # Server-side checks always re-run via Permissions.check/3.
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
  # Write endpoints — Stage 4
  # ---------------------------------------------------------------------------

  post "/events" do
    send_resp(conn, 501, Jason.encode!(%{error: "Not implemented — Stage 4"}))
  end

  patch "/events/:id" do
    send_resp(conn, 501, Jason.encode!(%{error: "Not implemented — Stage 4"}))
  end

  delete "/events/:id" do
    send_resp(conn, 501, Jason.encode!(%{error: "Not implemented — Stage 4"}))
  end

  post "/events/:id/cancel" do
    send_resp(conn, 501, Jason.encode!(%{error: "Not implemented — Stage 4"}))
  end

  post "/events/:id/rsvp" do
    send_resp(conn, 501, Jason.encode!(%{error: "Not implemented — Stage 4"}))
  end

  delete "/events/:id/rsvp" do
    send_resp(conn, 501, Jason.encode!(%{error: "Not implemented — Stage 4"}))
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

  defp format_datetime(nil), do: nil
  defp format_datetime(%DateTime{} = dt), do: DateTime.to_iso8601(dt)
  defp format_datetime(%NaiveDateTime{} = ndt) do
    # DB stores as utc_datetime which Ecto loads as NaiveDateTime without tz info.
    # Convert to UTC DateTime for consistent ISO 8601 output.
    ndt
    |> DateTime.from_naive!("Etc/UTC")
    |> DateTime.to_iso8601()
  end
end
