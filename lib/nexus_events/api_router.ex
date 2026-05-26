defmodule NexusEvents.ApiRouter do
  @moduledoc """
  API router for the Nexus Events extension.

  Mounted at /ext/nexus-events/api/... via the routes/0 callback
  in NexusEvents. All routes are implemented in Stage 3.
  """

  use Plug.Router

  plug :match
  plug :dispatch

  # Stage 3: all API endpoints are implemented here.

  match _ do
    send_resp(conn, 404, Jason.encode!(%{error: "not found"}))
  end
end
