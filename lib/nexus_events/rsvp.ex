defmodule NexusEvents.Rsvp do
  use Ecto.Schema
  import Ecto.Changeset

  @valid_responses ~w(attending maybe)

  schema "nexus_events_rsvps" do
    # belongs_to our own Event schema — safe because we own both tables.
    belongs_to :event, NexusEvents.Event

    # user_id stored as :string — guide §8.10 prohibits aliasing Nexus internal
    # schemas. No belongs_to Nexus.Accounts.User.
    field :user_id,  :string

    # "attending" | "maybe"
    field :response, :string, default: "attending"

    timestamps(type: :utc_datetime)
  end

  @doc """
  Changeset for creating or updating an RSVP.
  Response must be "attending" or "maybe". Uniqueness is enforced by the
  database unique index on [event_id, user_id].
  """
  def changeset(rsvp, attrs) do
    rsvp
    |> cast(attrs, [:event_id, :user_id, :response])
    |> validate_required([:event_id, :user_id, :response])
    |> validate_inclusion(:response, @valid_responses)
    |> unique_constraint([:event_id, :user_id],
        message: "user has already RSVPed to this event")
    |> foreign_key_constraint(:event_id)
  end
end
