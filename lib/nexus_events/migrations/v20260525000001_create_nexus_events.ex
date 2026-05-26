defmodule NexusEvents.Migrations.V20260525000001CreateNexusEvents do
  use Ecto.Migration

  def change do
    create table(:nexus_events_events) do
      # Link to the post this event was created from.
      # Stored as :string (matching hook payload delivery — post IDs are
      # string UUIDs). No references/2 constraint: extension tables must
      # not create hard FK constraints against Nexus core tables.
      # Nullable — events can exist independently of a post.
      add :post_id,         :string

      add :title,           :string,   null: false
      add :description,     :text
      add :image_url,       :string
      add :location,        :string

      # start_at and end_at are both required (end_at enforced in changeset).
      # Stored as utc_datetime matching Nexus timestamp convention.
      add :start_at,        :utc_datetime, null: false
      add :end_at,          :utc_datetime, null: false

      # "upcoming" | "cancelled"
      add :status,          :string, null: false, default: "upcoming"

      # RSVP settings — per-event overrides of the global extension setting.
      add :rsvp_enabled,    :boolean, null: false, default: true
      add :max_rsvp,        :integer, null: false, default: 0

      # Creator — stored as :string (string UUID) for same reason as post_id.
      add :creator_user_id, :string, null: false

      timestamps(type: :utc_datetime)
    end

    create index(:nexus_events_events, [:post_id])
    create index(:nexus_events_events, [:status])
    create index(:nexus_events_events, [:start_at])
    create index(:nexus_events_events, [:end_at])
    create index(:nexus_events_events, [:creator_user_id])
  end
end
