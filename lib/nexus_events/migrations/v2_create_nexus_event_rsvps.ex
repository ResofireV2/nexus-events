defmodule NexusEvents.Migrations.V2CreateNexusEventRsvps do
  use Ecto.Migration

  def change do
    create_if_not_exists table(:nexus_events_rsvps) do
      # FK to our own nexus_events_events table — safe to use references/2
      # because we own both sides of this relationship.
      add :event_id, references(:nexus_events_events, on_delete: :delete_all), null: false

      # User who RSVPed — stored as :string (string UUID), no references/2
      # to Nexus core users table per guide §8.10.
      add :user_id, :string, null: false

      # "attending" | "maybe"
      add :response, :string, null: false, default: "attending"

      timestamps(type: :utc_datetime)
    end

    # A user can only have one RSVP per event.
    create_if_not_exists unique_index(:nexus_events_rsvps, [:event_id, :user_id])
    create_if_not_exists index(:nexus_events_rsvps, [:event_id])
    create_if_not_exists index(:nexus_events_rsvps, [:user_id])
  end
end
