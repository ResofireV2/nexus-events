defmodule NexusEvents.Event do
  use Ecto.Schema
  import Ecto.Changeset

  @valid_statuses ~w(upcoming cancelled)

  schema "nexus_events_events" do
    # post_id stored as :string — Nexus post IDs are string UUIDs delivered
    # by hook payloads. No belongs_to Nexus.Forum.Post — guide §8.10 prohibits
    # aliasing Nexus internal schemas in extension code.
    field :post_id,         :string

    field :title,           :string
    field :description,     :string
    field :image_url,       :string
    field :location,        :string

    field :start_at,        :utc_datetime
    field :end_at,          :utc_datetime

    # "upcoming" | "cancelled"
    field :status,          :string, default: "upcoming"

    field :rsvp_enabled,    :boolean, default: true
    field :max_rsvp,        :integer, default: 0

    # creator_user_id stored as :string for same reason as post_id.
    field :creator_user_id, :string

    has_many :rsvps, NexusEvents.Rsvp

    timestamps(type: :utc_datetime)
  end

  @doc """
  Changeset for creating a new event. All required fields must be present.
  end_at is required and must be after start_at.
  """
  def create_changeset(event, attrs) do
    event
    |> cast(attrs, [
      :post_id, :title, :description, :image_url, :location,
      :start_at, :end_at, :rsvp_enabled, :max_rsvp, :creator_user_id
    ])
    |> validate_required([:title, :start_at, :end_at, :creator_user_id])
    |> validate_length(:title, min: 1, max: 200)
    |> validate_number(:max_rsvp, greater_than_or_equal_to: 0)
    |> validate_end_after_start()
    |> put_change(:status, "upcoming")
  end

  @doc """
  Changeset for updating an existing event. status cannot be changed here —
  use cancel_changeset/1 for cancellation.
  """
  def update_changeset(event, attrs) do
    event
    |> cast(attrs, [
      :title, :description, :image_url, :location,
      :start_at, :end_at, :rsvp_enabled, :max_rsvp
    ])
    |> validate_required([:title, :start_at, :end_at])
    |> validate_length(:title, min: 1, max: 200)
    |> validate_number(:max_rsvp, greater_than_or_equal_to: 0)
    |> validate_end_after_start()
  end

  @doc """
  Changeset for cancelling an event. Only transitions status to "cancelled".
  """
  def cancel_changeset(event) do
    event
    |> change(status: "cancelled")
    |> validate_inclusion(:status, @valid_statuses)
  end

  defp validate_end_after_start(changeset) do
    start_at = get_field(changeset, :start_at)
    end_at   = get_field(changeset, :end_at)

    if start_at && end_at && DateTime.compare(end_at, start_at) != :gt do
      add_error(changeset, :end_at, "must be after start time")
    else
      changeset
    end
  end
end
