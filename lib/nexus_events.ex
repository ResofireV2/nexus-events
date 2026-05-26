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
      {"/api", NexusEvents.ApiRouter, []}
    ]
  end

  # ---------------------------------------------------------------------------
  # Background workers
  # ---------------------------------------------------------------------------
  # RetentionJob is implemented in Stage 5.

  @impl true
  def child_specs do
    # RetentionJob is an Oban worker (a job module, not a process).
    # It is scheduled via Oban.insert in on_install/1 in Stage 5.
    # child_specs/0 is for GenServers and supervised processes only.
    []
  end

  # ---------------------------------------------------------------------------
  # Hook handlers
  # ---------------------------------------------------------------------------
  # The manifest declares hooks: [{"event": "post_deleted", "priority": 50}].
  # The loader checks that handle_event/3 is exported when hooks is non-empty.
  # Stage 4 adds the real cleanup logic; the catch-all satisfies the loader now.

  @impl true
  def handle_event("post_deleted", _payload, _settings) do
    # Stage 4: delete the linked event (if any) when a post is deleted.
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
  def handle_digest_section("upcoming_events", _period, _settings) do
    # Stage 10: query upcoming events and return card layout items.
    %{items: []}
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
