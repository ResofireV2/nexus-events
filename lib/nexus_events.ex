defmodule NexusEvents do
  @moduledoc """
  Nexus Events extension.

  Community event scheduling with RSVP, calendar views, and post-linked
  event cards.

  The manifest at manifest.json is the canonical declaration of what this
  extension contributes. Elixir callbacks below correspond to those
  declarations. The loader cross-checks at install time that every declared
  surface has a matching implementation.

  Surfaces declared in manifest.json and their implementing callbacks:

    hooks:           ["post_deleted"]  → handle_event/3
    slots:           ["post_footer"]   → JS bundle (no Elixir callback)
    routes:          ["/", "/event/:id"] → JS bundle + routes/0
    admin_panel:     present           → JS bundle (no Elixir callback)
    explore:         present           → JS bundle (no Elixir callback)
    toolbar_buttons: ["create-event"]  → JS bundle (no Elixir callback)
    digest_sections: ["upcoming_events"] → handle_digest_section/3
    notification_types: ["event_cancelled"] → called via Nexus.Notifications
    permissions:     8 entries         → checked via Nexus.Extensions.Permissions
  """

  use Nexus.Extensions.Behaviour

  require Logger

  # ---------------------------------------------------------------------------
  # Migrations
  # ---------------------------------------------------------------------------
  # Declared here so the loader runs them at install time and rolls them back
  # on uninstall. Migrations are implemented in Stage 2.

  @impl true
  def migrations do
    [
      NexusEvents.Migrations.V20260525000001CreateNexusEvents,
      NexusEvents.Migrations.V20260525000002CreateNexusEventRsvps
    ]
  end

  # ---------------------------------------------------------------------------
  # Routes
  # ---------------------------------------------------------------------------
  # Mounts the API router at /ext/nexus-events/api/...
  # ApiRouter is implemented in Stage 3.

  @impl true
  def routes do
    [
      {"/", NexusEvents.ApiRouter, []}
    ]
  end

  # ---------------------------------------------------------------------------
  # Background workers
  # ---------------------------------------------------------------------------
  # RetentionJob is implemented in Stage 5.

  @impl true
  def child_specs do
    # RetentionScheduler is a GenServer that enqueues the weekly RetentionJob.
    # Per guide §3021: recurring work belongs in child_specs/0 so it runs
    # on every boot, not just on install.
    # RetentionJob itself is an Oban.Worker — not a process, not listed here.
    [
      {NexusEvents.Workers.RetentionScheduler, []}
    ]
  end

  # ---------------------------------------------------------------------------
  # Hook handlers
  # ---------------------------------------------------------------------------
  # The manifest declares hooks: [{"event": "post_deleted", "priority": 50}].
  # The loader checks that handle_event/3 is exported when hooks is non-empty.
  # Stage 4 adds the real cleanup logic; the catch-all satisfies the loader now.

  @impl true
  def handle_event("post_deleted", %{post_id: post_id}, _settings) do
    NexusEvents.Events.delete_event_for_post(post_id)
    :ok
  end

  # Catch-all required: any declared event without a specific clause lands here.
  def handle_event(_event, _payload, _settings), do: :ok

  # ---------------------------------------------------------------------------
  # Digest sections
  # ---------------------------------------------------------------------------
  # The manifest declares digest_sections: ["upcoming_events"].
  # The loader checks that handle_digest_section/3 is exported when
  # digest_sections is non-empty.
  # Stage 10 adds real content; the stub satisfies the loader now.

  @impl true
  def handle_digest_section("upcoming_events", period, _settings) do
    import Ecto.Query
    alias Nexus.Repo

    now = DateTime.utc_now()

    # Query events that start between now and the end of the digest period.
    # This gives "events coming up in the next day/week/month" depending
    # on the digest frequency.
    events =
      from(e in NexusEvents.Event,
        where:
          e.status   == "upcoming" and
          e.start_at >= ^now       and
          e.start_at <= ^period.to,
        order_by: [asc: e.start_at],
        limit: 10
      )
      |> Repo.all()

    if events == [] do
      # Empty items list causes the section to be silently dropped per guide §8.8.
      %{items: []}
    else
      items =
        Enum.map(events, fn event ->
          start_label =
            Calendar.strftime(event.start_at, "%b %-d, %Y · %-I:%M %p")

          %{
            label:     event.title,
            sublabel:  start_label <> if(event.location, do: " · #{event.location}", else: ""),
            image_url: event.image_url,
            url:       "/ext/nexus-events/event/#{event.id}"
          }
        end)

      %{
        title:  "Upcoming Events — #{period.period_label}",
        layout: "card",
        items:  items,
        cta:    %{label: "View all events", url: "/ext/nexus-events"}
      }
    end
  end

  def handle_digest_section(_key, _period, _settings), do: %{items: []}

  # ---------------------------------------------------------------------------
  # Lifecycle
  # ---------------------------------------------------------------------------

  @impl true
  def on_install(_settings) do
    Logger.info("NexusEvents: installed")
    :ok
  end

  @impl true
  def on_update(from_version, to_version) do
    Logger.info("NexusEvents: updated #{from_version} → #{to_version}")
    :ok
  end

  @impl true
  def on_uninstall do
    Logger.info("NexusEvents: uninstalled")
    :ok
  end
end
