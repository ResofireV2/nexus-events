defmodule NexusEvents.Events do
  @moduledoc """
  Context for NexusEvents. Handles all database access for events and RSVPs.

  Guide §8.10: use Nexus.Repo directly. Reference Nexus tables by string
  name in queries, never by aliasing internal schema modules.
  """

  import Ecto.Query
  alias Nexus.Repo
  alias NexusEvents.{Event, Rsvp}

  # ---------------------------------------------------------------------------
  # Events — read
  # ---------------------------------------------------------------------------

  @doc """
  Lists events filtered by status.

  filter: "upcoming" returns events with status "upcoming" ordered by start_at asc.
  filter: "past"     returns events with status "upcoming" where end_at is in the
                     past, plus all "cancelled" events, ordered by start_at desc.

  Returns at most `limit` results.
  """
  def list_events(filter, limit \\ 20) do
    now = DateTime.utc_now()

    case filter do
      "past" ->
        from(e in Event,
          where: (e.status == "upcoming" and e.end_at < ^now) or e.status == "cancelled",
          order_by: [desc: e.start_at],
          limit: ^limit
        )
        |> Repo.all()

      _ ->
        from(e in Event,
          where: e.status == "upcoming" and e.end_at >= ^now,
          order_by: [asc: e.start_at],
          limit: ^limit
        )
        |> Repo.all()
    end
  end

  @doc """
  Gets a single event by id. Returns nil if not found.
  """
  def get_event(id) do
    Repo.get(Event, id)
  end

  @doc """
  Gets the event linked to a post_id. Returns nil if no event is linked.
  """
  def get_event_for_post(post_id) do
    Repo.get_by(Event, post_id: post_id)
  end

  @doc """
  Returns RSVP counts for an event as a map:
  %{attending: integer, maybe: integer, total: integer}
  """
  def rsvp_counts(event_id) do
    counts =
      from(r in Rsvp,
        where: r.event_id == ^event_id,
        group_by: r.response,
        select: {r.response, count(r.id)}
      )
      |> Repo.all()
      |> Map.new()

    attending = Map.get(counts, "attending", 0)
    maybe     = Map.get(counts, "maybe", 0)
    %{attending: attending, maybe: maybe, total: attending + maybe}
  end

  @doc """
  Lists attendees for an event. Returns a list of maps with user_id and response.
  """
  def list_attendees(event_id) do
    from(r in Rsvp,
      where: r.event_id == ^event_id,
      order_by: [asc: r.inserted_at],
      select: %{user_id: r.user_id, response: r.response}
    )
    |> Repo.all()
  end

  @doc """
  Gets the RSVP for a specific user on a specific event. Returns nil if none.
  """
  def get_rsvp(event_id, user_id) do
    Repo.get_by(Rsvp, event_id: event_id, user_id: user_id)
  end

  # ---------------------------------------------------------------------------
  # Events — write
  # ---------------------------------------------------------------------------

  @doc """
  Creates a new event.
  Returns {:ok, event} or {:error, changeset}.
  """
  def create_event(attrs) do
    %Event{}
    |> Event.create_changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Updates an existing event.
  Returns {:ok, event} or {:error, changeset}.
  """
  def update_event(%Event{} = event, attrs) do
    event
    |> Event.update_changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Cancels an event by setting its status to "cancelled".
  Returns {:ok, event} or {:error, changeset}.
  """
  def cancel_event(%Event{} = event) do
    event
    |> Event.cancel_changeset()
    |> Repo.update()
  end

  @doc """
  Deletes an event. RSVPs cascade-delete via the DB foreign key constraint.
  Returns {:ok, event} or {:error, changeset}.
  """
  def delete_event(%Event{} = event) do
    Repo.delete(event)
  end

  # ---------------------------------------------------------------------------
  # RSVPs — write
  # ---------------------------------------------------------------------------

  @doc """
  Creates or updates an RSVP for a user on an event.

  If the user already has an RSVP, updates the response.
  Returns {:ok, rsvp} or {:error, changeset}.
  """
  def upsert_rsvp(event_id, user_id, response) do
    case get_rsvp(event_id, user_id) do
      nil ->
        %Rsvp{}
        |> Rsvp.changeset(%{event_id: event_id, user_id: user_id, response: response})
        |> Repo.insert()

      existing ->
        existing
        |> Rsvp.changeset(%{response: response})
        |> Repo.update()
    end
  end

  @doc """
  Removes a user's RSVP from an event.
  Returns {:ok, rsvp} if it existed, {:error, :not_found} if it didn't.
  """
  def delete_rsvp(event_id, user_id) do
    case get_rsvp(event_id, user_id) do
      nil  -> {:error, :not_found}
      rsvp -> Repo.delete(rsvp)
    end
  end

  @doc """
  Deletes the event linked to a post_id if one exists. Called from the
  post_deleted hook handler. RSVPs cascade-delete via the DB constraint.
  """
  def delete_event_for_post(post_id) do
    case get_event_for_post(post_id) do
      nil   -> :ok
      event -> Repo.delete(event)
    end
    :ok
  end

  @doc """
  Deletes all past events beyond the configured retention window.
  Called by the RetentionJob (Stage 5).

  retention is one of: "30_days", "90_days", "180_days", "1_year", "forever".
  Returns the number of deleted rows.
  """
  def delete_past_events_beyond_retention(retention) do
    cutoff = retention_cutoff(retention)

    case cutoff do
      :forever ->
        0

      cutoff_dt ->
        {count, _} =
          from(e in Event,
            where: e.end_at < ^cutoff_dt
          )
          |> Repo.delete_all()

        count
    end
  end



  
  @doc """
  Links an event to a post by setting its post_id.
  Called from persist_attachment/3 after a post is committed.
  event_id arrives as a string from the JSON attachment data.
  post_id arrives as a string from the hook payload.
  """
  def link_event_to_post(event_id, post_id) when is_binary(event_id) do
    event_id_int = String.to_integer(event_id)

    from(e in Event, where: e.id == ^event_id_int)
    |> Repo.update_all(set: [post_id: to_string(post_id)])

    :ok
  end

  def link_event_to_post(_event_id, _post_id), do: :ok

  defp retention_cutoff("30_days"),  do: DateTime.add(DateTime.utc_now(), -30,  :day)
  defp retention_cutoff("90_days"),  do: DateTime.add(DateTime.utc_now(), -90,  :day)
  defp retention_cutoff("180_days"), do: DateTime.add(DateTime.utc_now(), -180, :day)
  defp retention_cutoff("1_year"),   do: DateTime.add(DateTime.utc_now(), -365, :day)
  defp retention_cutoff(_),          do: :forever
end
