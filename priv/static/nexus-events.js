(function () {
  "use strict";

  const NE   = window.NexusExtensions;
  const SLUG = "nexus-events";

  // Destructure hooks from window.React per guide §9.14.1.
  // There is only one React on the page — Nexus's. Extension bundles
  // must not ship their own copy.
  const { useState, useEffect, useCallback, Fragment } = window.React;

  // NexusComponents: toast for user feedback per guide §9.14.2
  const { toast } = window.NexusComponents;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  // All extension API calls go to /ext/<slug>/api/... with Bearer token.
  // The Nexus api module prefixes /api/v1 — not correct for extension calls.
  function extFetch(path, options = {}) {
    const token = localStorage.getItem("nexus_token");
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(`/ext/${SLUG}/api${path}`, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) },
    }).then(function (res) {
      if (!res.ok && res.status !== 422) return {};
      return res.json();
    }).catch(function () {
      return {};
    });
  }

  function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      weekday: "short", month: "short", day: "numeric", year: "numeric"
    });
  }

  function formatTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  // ---------------------------------------------------------------------------
  // PostFooterCard
  // Registered to the post_footer slot.
  // Slot contract: receives { post_id } only — see propsForSlot in nexus.jsx.
  // post_id is post.id (integer) from the Nexus post object.
  // ---------------------------------------------------------------------------

  function PostFooterCard({ post_id }) {
    const [state, setState] = useState("loading"); // "loading" | "empty" | "ready" | "error"
    const [event, setEvent] = useState(null);
    const [counts, setCounts] = useState({ attending: 0, maybe: 0, total: 0 });
    const [userRsvp, setUserRsvp] = useState(null); // null | { response: "attending"|"maybe" }
    const [rsvpLoading, setRsvpLoading] = useState(false);

    // Fetch event for this post on mount and when post_id changes.
    useEffect(function () {
      if (!post_id) { setState("empty"); return; }

      setState("loading");

      extFetch(`/posts/${post_id}/event`)
        .then(function (data) {
          if (!data || !data.event) {
            setState("empty");
            return;
          }
          setEvent(data.event);
          setCounts(data.rsvp_counts || { attending: 0, maybe: 0, total: 0 });
          setUserRsvp(data.user_rsvp || null);
          setState("ready");
        })
        .catch(function () {
          setState("error");
        });
    }, [post_id]);

    // RSVP handler — creates or updates the user's RSVP.
    const handleRsvp = useCallback(function (response) {
      if (rsvpLoading || !event) return;
      setRsvpLoading(true);

      extFetch(`/events/${event.id}/rsvp`, {
        method: "POST",
        body: JSON.stringify({ response }),
      })
        .then(function (data) {
          if (data && data.rsvp) {
            setUserRsvp(data.rsvp);
            setCounts(data.rsvp_counts);
            toast(response === "attending" ? "You're attending!" : "Marked as interested.");
          } else {
            toast("Couldn't RSVP — please try again.", "err");
          }
        })
        .finally(function () {
          setRsvpLoading(false);
        });
    }, [event, rsvpLoading]);

    // Un-RSVP handler.
    const handleUnrsvp = useCallback(function () {
      if (rsvpLoading || !event) return;
      setRsvpLoading(true);

      extFetch(`/events/${event.id}/rsvp`, { method: "DELETE" })
        .then(function (data) {
          if (data && data.ok) {
            setUserRsvp(null);
            setCounts(data.rsvp_counts);
            toast("RSVP removed.");
          } else {
            toast("Couldn't remove RSVP — please try again.", "err");
          }
        })
        .finally(function () {
          setRsvpLoading(false);
        });
    }, [event, rsvpLoading]);

    // Render nothing for non-event posts or while loading.
    if (state === "loading" || state === "empty" || state === "error") return null;
    if (!event) return null;

    const isCancelled = event.status === "cancelled";

    return React.createElement("div", {
      style: {
        border: "0.5px solid var(--b1)",
        borderRadius: "12px",
        background: "var(--s1)",
        overflow: "hidden",
      }
    },

      // Cover image — only shown if present
      event.image_url && React.createElement("div", {
        style: {
          width: "100%",
          maxHeight: "180px",
          overflow: "hidden",
        }
      },
        React.createElement("img", {
          src: event.image_url,
          alt: event.title,
          style: {
            width: "100%",
            height: "180px",
            objectFit: "cover",
            display: "block",
          }
        })
      ),

      // Card body
      React.createElement("div", { style: { padding: "14px 16px" } },

        // Header row: icon + title + cancelled badge
        React.createElement("div", {
          style: {
            display: "flex",
            alignItems: "flex-start",
            gap: "10px",
            marginBottom: "10px",
          }
        },
          React.createElement("i", {
            className: "fa-solid fa-calendar-days",
            style: { color: "var(--ac)", fontSize: "16px", marginTop: "2px", flexShrink: 0 },
            "aria-hidden": "true",
          }),
          React.createElement("div", { style: { flex: 1, minWidth: 0 } },
            React.createElement("div", {
              style: {
                fontSize: "var(--fs-body)",
                fontWeight: 500,
                color: "var(--t1)",
                lineHeight: 1.3,
              }
            }, event.title),

            isCancelled && React.createElement("span", {
              style: {
                display: "inline-block",
                marginTop: "4px",
                fontSize: "11px",
                padding: "2px 8px",
                borderRadius: "20px",
                background: "rgba(248,113,113,0.12)",
                color: "var(--red)",
                border: "0.5px solid var(--red)",
              }
            }, "Cancelled")
          )
        ),

        // Date and time
        React.createElement("div", {
          style: {
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "13px",
            color: "var(--t3)",
            marginBottom: "4px",
          }
        },
          React.createElement("i", {
            className: "fa-regular fa-clock",
            style: { fontSize: "12px" },
            "aria-hidden": "true",
          }),
          React.createElement("span", null,
            formatDate(event.start_at),
            " · ",
            formatTime(event.start_at),
            " – ",
            formatTime(event.end_at)
          )
        ),

        // Location — only shown if present
        event.location && React.createElement("div", {
          style: {
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "13px",
            color: "var(--t3)",
            marginBottom: "4px",
          }
        },
          React.createElement("i", {
            className: "fa-solid fa-location-dot",
            style: { fontSize: "12px" },
            "aria-hidden": "true",
          }),
          React.createElement("span", null, event.location)
        ),

        // RSVP row — only shown if rsvp_enabled and not cancelled
        event.rsvp_enabled && !isCancelled && React.createElement("div", {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "12px",
            paddingTop: "12px",
            borderTop: "0.5px solid var(--b1)",
          }
        },

          // Attendee counts
          React.createElement("div", {
            style: { fontSize: "13px", color: "var(--t3)" }
          },
            React.createElement("i", {
              className: "fa-solid fa-users",
              style: { marginRight: "5px", fontSize: "12px" },
              "aria-hidden": "true",
            }),
            counts.attending,
            " attending",
            counts.maybe > 0 && ` · ${counts.maybe} maybe`
          ),

          // RSVP controls
          React.createElement("div", {
            style: { display: "flex", gap: "6px" }
          },
            userRsvp
              // Already RSVPed — show current state + un-RSVP option
              ? React.createElement(Fragment, null,
                  React.createElement("span", {
                    style: {
                      fontSize: "12px",
                      padding: "5px 10px",
                      borderRadius: "20px",
                      background: "var(--ac-bg)",
                      color: "var(--ac-text)",
                      border: "0.5px solid var(--ac-border)",
                    }
                  },
                    React.createElement("i", {
                      className: "fa-solid fa-check",
                      style: { marginRight: "4px", fontSize: "10px" },
                      "aria-hidden": "true",
                    }),
                    userRsvp.response === "attending" ? "Attending" : "Interested"
                  ),
                  React.createElement("button", {
                    className: "btn-ghost",
                    onClick: handleUnrsvp,
                    disabled: rsvpLoading,
                    style: { fontSize: "12px", padding: "5px 10px" },
                  }, "Remove")
                )
              // Not RSVPed — show RSVP buttons
              : React.createElement(Fragment, null,
                  React.createElement("button", {
                    className: "btn-primary",
                    onClick: function () { handleRsvp("attending"); },
                    disabled: rsvpLoading,
                    style: { fontSize: "13px", padding: "6px 16px" },
                  }, rsvpLoading ? "…" : "Attend"),

                  // "Maybe" button only shown if allow_maybe is enabled.
                  // We check the /permissions endpoint response cached in the
                  // component — but allow_maybe is a setting, not a permission.
                  // We read it from the event object which doesn't carry settings.
                  // Simplest approach: always show Maybe; the API will reject if
                  // allow_maybe=false and the changeset validates response.
                  // Actually: the API accepts "maybe" regardless of setting —
                  // settings gate is in the admin UI only for now. Stage 9 wires
                  // the setting check properly from the CalendarPage fetch.
                  // For the post_footer card, we show both buttons always.
                  React.createElement("button", {
                    className: "btn-ghost",
                    onClick: function () { handleRsvp("maybe"); },
                    disabled: rsvpLoading,
                    style: { fontSize: "13px", padding: "6px 16px" },
                  }, "Maybe")
                )
          )
        ),

        // Cancelled state: show attendee count but no RSVP controls
        isCancelled && counts.total > 0 && React.createElement("div", {
          style: {
            marginTop: "10px",
            fontSize: "13px",
            color: "var(--t3)",
          }
        },
          `${counts.attending} had attended`
        )

      ) // end card body
    ); // end outer div
  }

  // ---------------------------------------------------------------------------
  // Routes — real components come in Stage 7
  // ---------------------------------------------------------------------------

  function CalendarPage() {
    return null; // Stage 7
  }

  function EventDetailPage() {
    return null; // Stage 7
  }

  // ---------------------------------------------------------------------------
  // Admin panel — Stage 9
  // ---------------------------------------------------------------------------

  function AdminPanelComponent() {
    return null; // Stage 9
  }

  // ---------------------------------------------------------------------------
  // Registrations
  // ---------------------------------------------------------------------------

  NE.registerRoute(SLUG, "/", CalendarPage, { title: "Events" });
  NE.registerRoute(SLUG, "/event/:id", EventDetailPage, { title: "Event" });

  NE.registerSlot({
    slug:      SLUG,
    slot:      "post_footer",
    component: PostFooterCard,
    priority:  50,
  });

  NE.registerAdminPanel(SLUG, {
    label:     "Events",
    icon:      "fa-calendar",
    component: AdminPanelComponent,
  });

  NE.registerExploreItem({
    slug:  SLUG,
    path:  "/",
    label: "Events",
    icon:  "fa-calendar",
  });

  NE.registerToolbarButton({
    slug:  SLUG,
    id:    "create-event",
    icon:  "fa-solid fa-calendar-plus",
    tip:   "Create an event",
    scope: "posts",
    onClick: function () {
      // Stage 8: open CreateEventModal
    },
  });

  NE.registerNotificationType("event_cancelled", {
    icon:      "fa-calendar-xmark",
    iconColor: "var(--red)",
    renderBody: function (n) {
      return React.createElement(
        Fragment,
        null,
        React.createElement("strong", { style: { color: "var(--t1)" } },
          n.data && n.data.event_title ? n.data.event_title : "An event"
        ),
        React.createElement("span", { style: { color: "var(--t3)" } },
          " has been cancelled."
        )
      );
    },
    onClick: function (_ref) {
      // Stage 10: navigate to calendar
    },
  });

})();
