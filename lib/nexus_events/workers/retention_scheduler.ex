defmodule NexusEvents.Workers.RetentionScheduler do
  @moduledoc """
  GenServer that schedules the weekly RetentionJob.

  Registered in NexusEvents.child_specs/0 per guide §3021:
  "If your extension needs initialization work that runs on every boot
  (scheduling a recurring job), put it in child_specs/0."

  On every boot (and therefore on every Nexus restart), this process:
    1. Immediately enqueues a RetentionJob for the current window.
    2. Schedules a :tick message to fire once per week.
    3. On each :tick, enqueues another RetentionJob and reschedules.

  The RetentionJob's unique constraint (period: 604800, states: available/
  scheduled/executing) prevents duplicate jobs if the scheduler boots
  multiple times within a week or the extension is reloaded.
  """

  use GenServer

  require Logger

  # One week in milliseconds — the interval between retention runs.
  @interval_ms 7 * 24 * 60 * 60 * 1_000

  # ---------------------------------------------------------------------------
  # Public API
  # ---------------------------------------------------------------------------

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  # ---------------------------------------------------------------------------
  # GenServer callbacks
  # ---------------------------------------------------------------------------

  @impl GenServer
  def init(_opts) do
    # Enqueue immediately on boot so a retention pass runs after every restart.
    # The unique constraint prevents re-running within the same weekly window.
    enqueue_job()

    # Schedule the first recurring tick.
    Process.send_after(self(), :tick, @interval_ms)

    {:ok, %{}}
  end

  @impl GenServer
  def handle_info(:tick, state) do
    enqueue_job()
    Process.send_after(self(), :tick, @interval_ms)
    {:noreply, state}
  end

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  defp enqueue_job do
    case %{} |> NexusEvents.Workers.RetentionJob.new() |> Oban.insert() do
      {:ok, job} ->
        Logger.info("NexusEvents.RetentionScheduler: enqueued RetentionJob id=#{job.id}")

      {:error, reason} ->
        Logger.warning("NexusEvents.RetentionScheduler: failed to enqueue RetentionJob: #{inspect(reason)}")
    end
  end
end
