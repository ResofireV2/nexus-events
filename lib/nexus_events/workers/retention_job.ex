defmodule NexusEvents.Workers.RetentionJob do
  @moduledoc """
  Oban worker that deletes past events beyond the configured retention window.

  Runs on the :extensions queue per guide §8.7 (extension jobs must use
  this queue — :default, :mailers, :media, :webhooks are Nexus-internal).

  The worker module is nested under NexusEvents.Workers.* per the namespace
  rule in guide §8.7: Nexus uses the module name prefix to cancel pending
  jobs at uninstall time. Workers outside the extension's namespace survive
  uninstall and crash on next execution.

  Unique constraint (period: 604800 = one week) prevents duplicate jobs
  from being enqueued if the scheduler restarts or the extension reboots
  within the same weekly window.
  """

  use Oban.Worker,
    queue: :extensions,
    max_attempts: 3,
    unique: [
      period: 604_800,
      states: [:available, :scheduled, :executing]
    ]

  require Logger

  @slug "nexus-events"

  @impl Oban.Worker
  def perform(%Oban.Job{}) do
    # Read settings fresh at job execution time, per guide §8.7:
    # "outside callbacks, call Nexus.Extensions.get_extension_by_slug(slug).settings"
    retention =
      case Nexus.Extensions.get_extension_by_slug(@slug) do
        nil ->
          # Extension was uninstalled between scheduling and execution.
          # Return :ok — job will not be re-enqueued.
          Logger.info("NexusEvents.RetentionJob: extension not found, skipping")
          :skip

        ext ->
          (ext.settings || %{})["past_event_retention"] || "forever"
      end

    case retention do
      :skip ->
        :ok

      "forever" ->
        Logger.info("NexusEvents.RetentionJob: retention=forever, nothing to delete")
        :ok

      window ->
        count = NexusEvents.Events.delete_past_events_beyond_retention(window)
        Logger.info("NexusEvents.RetentionJob: deleted #{count} past event(s) beyond #{window}")
        :ok
    end
  end
end
