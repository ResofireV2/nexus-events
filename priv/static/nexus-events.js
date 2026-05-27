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

        // Description — only shown if present
        event.description && React.createElement("div", {
          style: {
            fontSize: "13px",
            color: "var(--t2)",
            lineHeight: 1.5,
            marginTop: "6px",
            marginBottom: "4px",
          }
        }, event.description),

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
  // Date utilities — no external dependencies
  // ---------------------------------------------------------------------------

  // Detect mobile viewport (≤767.99px — Nexus breakpoint).
  // Called at render time so it reacts to orientation changes.
  function isMobile() {
    return window.innerWidth <= 767;
  }

  function startOfMonth(year, month) {
    return new Date(year, month, 1);
  }

  function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() &&
           a.getDate() === b.getDate();
  }

  function isToday(d) {
    return isSameDay(d, new Date());
  }

  function formatMonthYear(year, month) {
    return new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }

  function formatWeekRange(date) {
    const sun = new Date(date);
    sun.setDate(sun.getDate() - sun.getDay());
    const sat = new Date(sun);
    sat.setDate(sat.getDate() + 6);
    const opts = { month: "short", day: "numeric" };
    return sun.toLocaleDateString(undefined, opts) + " – " + sat.toLocaleDateString(undefined, opts);
  }

  function formatQuarter(year, quarter) {
    return "Q" + quarter + " " + year;
  }

  function getQuarter(year, month) {
    return Math.floor(month / 3) + 1;
  }

  function quarterStartMonth(quarter) {
    return (quarter - 1) * 3;
  }

  function eventsOnDay(events, year, month, day) {
    const d = new Date(year, month, day);
    return events.filter(function (e) {
      const start = new Date(e.start_at);
      const end   = new Date(e.end_at);
      return d >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) &&
             d <= new Date(end.getFullYear(),   end.getMonth(),   end.getDate());
    });
  }

  function eventsInWeek(events, weekStart) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    return events.filter(function (e) {
      const start = new Date(e.start_at);
      return start >= weekStart && start <= weekEnd;
    });
  }

  function startOfWeekContaining(date) {
    const d = new Date(date);
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function formatShortDate(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function formatTime(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function formatDateFull(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: "short", month: "short", day: "numeric", year: "numeric"
    });
  }

  // Chip color by event index for visual variety
  var CHIP_COLORS = [
    { bg: "rgba(167,139,250,0.18)", color: "var(--ac-text)" },
    { bg: "rgba(52,211,153,0.15)",  color: "var(--green)" },
    { bg: "rgba(251,191,36,0.13)",  color: "#fbbf24" },
    { bg: "rgba(96,165,250,0.15)",  color: "#60a5fa" },
  ];

  function chipColor(idx) {
    return CHIP_COLORS[idx % CHIP_COLORS.length];
  }

  // ---------------------------------------------------------------------------
  // EventDetailModal — opens when clicking an event chip or row
  // ---------------------------------------------------------------------------

  function EventDetailModal({ event, onClose, currentUser }) {
    const [counts, setCounts]       = useState(null);
    const [userRsvp, setUserRsvp]   = useState(null);
    const [rsvpLoading, setRsvpLoading] = useState(false);
    const { toast } = window.NexusComponents;

    useEffect(function () {
      if (!event) return;
      extFetch("/events/" + event.id)
        .then(function (data) {
          if (data && data.rsvp_counts) setCounts(data.rsvp_counts);
          if (data && data.user_rsvp)   setUserRsvp(data.user_rsvp);
        });
    }, [event && event.id]);

    if (!event) return null;

    var isCancelled = event.status === "cancelled";

    function handleRsvp(response) {
      if (rsvpLoading) return;
      setRsvpLoading(true);
      extFetch("/events/" + event.id + "/rsvp", {
        method: "POST",
        body: JSON.stringify({ response: response }),
      }).then(function (data) {
        if (data && data.rsvp) {
          setUserRsvp(data.rsvp);
          setCounts(data.rsvp_counts);
          toast(response === "attending" ? "You're attending!" : "Marked as interested.");
        } else {
          toast("Couldn't RSVP — please try again.", "err");
        }
      }).finally(function () { setRsvpLoading(false); });
    }

    function handleUnrsvp() {
      if (rsvpLoading) return;
      setRsvpLoading(true);
      extFetch("/events/" + event.id + "/rsvp", { method: "DELETE" })
        .then(function (data) {
          if (data && data.ok) {
            setUserRsvp(null);
            setCounts(data.rsvp_counts);
            toast("RSVP removed.");
          } else {
            toast("Couldn't remove RSVP — please try again.", "err");
          }
        }).finally(function () { setRsvpLoading(false); });
    }

    return React.createElement("div", {
      style: {
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      },
      onClick: function (e) { if (e.target === e.currentTarget) onClose(); },
    },
      React.createElement("div", {
        style: {
          background: "var(--s2)",
          border: "0.5px solid var(--b2)",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "480px",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }
      },
        // Cover image
        event.image_url && React.createElement("div", {
          style: { width: "100%", height: "180px", overflow: "hidden", borderRadius: "16px 16px 0 0" }
        },
          React.createElement("img", {
            src: event.image_url, alt: event.title,
            style: { width: "100%", height: "100%", objectFit: "cover", display: "block" }
          })
        ),

        // Modal content
        React.createElement("div", { style: { padding: "20px 24px 24px" } },

          // Header
          React.createElement("div", {
            style: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }
          },
            React.createElement("div", { style: { flex: 1, minWidth: 0 } },
              React.createElement("h2", {
                style: { fontSize: "18px", fontWeight: 600, color: "var(--t1)", margin: "0 0 4px", lineHeight: 1.3 }
              }, event.title),
              isCancelled && React.createElement("span", {
                style: {
                  display: "inline-block", fontSize: "11px", padding: "2px 8px",
                  borderRadius: "20px", background: "rgba(248,113,113,0.12)",
                  color: "var(--red)", border: "0.5px solid var(--red)",
                }
              }, "Cancelled")
            ),
            React.createElement("div", {
              style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: 0, marginLeft: "12px" }
            },
              // View post button — only shown when event is linked to a post
              event.post_id && React.createElement("a", {
                href: "/post/" + event.post_id,
                onClick: function (e) {
                  e.preventDefault();
                  window.NexusExtensions.navigate("/post/" + event.post_id);
                  onClose();
                },
                style: {
                  fontSize: "12px", padding: "5px 12px", borderRadius: "20px",
                  background: "rgba(255,255,255,0.06)", border: "0.5px solid var(--b2)",
                  color: "var(--t3)", cursor: "pointer", textDecoration: "none",
                  display: "flex", alignItems: "center", gap: "5px",
                  whiteSpace: "nowrap",
                },
              },
                React.createElement("i", { className: "fa-solid fa-arrow-up-right-from-square", style: { fontSize: "10px" }, "aria-hidden": "true" }),
                "View post"
              ),
              React.createElement("button", {
                onClick: onClose,
                style: {
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--t3)", fontSize: "18px", lineHeight: 1,
                  padding: "4px",
                },
                "aria-label": "Close",
              },
                React.createElement("i", { className: "fa-solid fa-xmark", "aria-hidden": "true" })
              )
            )
          ),

          // Details
          React.createElement("div", {
            style: { display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }
          },
            React.createElement("div", {
              style: { display: "flex", gap: "8px", fontSize: "13px", color: "var(--t3)" }
            },
              React.createElement("i", { className: "fa-regular fa-clock", style: { marginTop: "2px" }, "aria-hidden": "true" }),
              React.createElement("span", null,
                formatDateFull(event.start_at), " · ",
                formatTime(event.start_at), " – ", formatTime(event.end_at)
              )
            ),

            event.location && React.createElement("div", {
              style: { display: "flex", gap: "8px", fontSize: "13px", color: "var(--t3)" }
            },
              React.createElement("i", { className: "fa-solid fa-location-dot", style: { marginTop: "2px" }, "aria-hidden": "true" }),
              React.createElement("span", null, event.location)
            ),

            event.description && React.createElement("div", {
              style: { fontSize: "14px", color: "var(--t2)", lineHeight: 1.6, marginTop: "4px" }
            }, event.description)
          ),

          // RSVP section
          event.rsvp_enabled && !isCancelled && React.createElement("div", {
            style: { borderTop: "0.5px solid var(--b1)", paddingTop: "16px" }
          },
            counts && React.createElement("div", {
              style: { fontSize: "13px", color: "var(--t3)", marginBottom: "12px" }
            },
              React.createElement("i", { className: "fa-solid fa-users", style: { marginRight: "6px" }, "aria-hidden": "true" }),
              counts.attending, " attending",
              counts.maybe > 0 && (" · " + counts.maybe + " maybe")
            ),

            React.createElement("div", { style: { display: "flex", gap: "8px" } },
              userRsvp
                ? React.createElement(React.Fragment, null,
                    React.createElement("span", {
                      style: {
                        fontSize: "13px", padding: "7px 14px", borderRadius: "20px",
                        background: "var(--ac-bg)", color: "var(--ac-text)",
                        border: "0.5px solid var(--ac-border)",
                      }
                    },
                      React.createElement("i", { className: "fa-solid fa-check", style: { marginRight: "6px", fontSize: "11px" }, "aria-hidden": "true" }),
                      userRsvp.response === "attending" ? "Attending" : "Interested"
                    ),
                    React.createElement("button", {
                      className: "btn-ghost",
                      onClick: handleUnrsvp,
                      disabled: rsvpLoading,
                    }, "Remove")
                  )
                : React.createElement(React.Fragment, null,
                    React.createElement("button", {
                      className: "btn-primary",
                      onClick: function () { handleRsvp("attending"); },
                      disabled: rsvpLoading,
                    }, rsvpLoading ? "…" : "Attend"),
                    React.createElement("button", {
                      className: "btn-ghost",
                      onClick: function () { handleRsvp("maybe"); },
                      disabled: rsvpLoading,
                    }, "Maybe")
                  )
            )
          )
        )
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Monthly view
  // ---------------------------------------------------------------------------

  function MonthlyView({ events, year, month, canCreate, onEventClick, onNewEvent }) {
    var firstDay = startOfMonth(year, month).getDay();
    var days = daysInMonth(year, month);
    var cells = [];

    // Leading cells from previous month
    var prevDays = daysInMonth(year, month - 1);
    for (var i = 0; i < firstDay; i++) {
      cells.push({ day: prevDays - firstDay + 1 + i, thisMonth: false });
    }
    for (var d = 1; d <= days; d++) {
      cells.push({ day: d, thisMonth: true });
    }
    // Trailing cells
    var remaining = 42 - cells.length;
    for (var t = 1; t <= remaining; t++) {
      cells.push({ day: t, thisMonth: false });
    }

    var dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    return React.createElement("div", { style: { paddingBottom: "24px" } },
      // Day headers
      React.createElement("div", {
        style: {
          display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
          borderRadius: "12px 12px 0 0",
          overflow: "hidden",
          border: "0.5px solid var(--b1)",
          borderBottom: "none",
        }
      },
        dayNames.map(function (n) {
          return React.createElement("div", {
            key: n,
            style: {
              background: "var(--s1)", padding: "8px 0", textAlign: "center",
              fontSize: "10px", fontWeight: 500, color: "var(--t3)",
              textTransform: "uppercase", letterSpacing: "0.6px",
            }
          }, n);
        })
      ),
      // Grid
      React.createElement("div", {
        style: {
          display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
          gap: "1px", background: "var(--b1)",
          border: "0.5px solid var(--b1)",
          borderTop: "none",
          borderRadius: "0 0 12px 12px",
          overflow: "hidden",
        }
      },
        cells.map(function (cell, idx) {
          var cellEvents = cell.thisMonth
            ? eventsOnDay(events, year, month, cell.day)
            : [];
          var today = cell.thisMonth && isToday(new Date(year, month, cell.day));
          var MAX_CHIPS = 2;
          var overflow = cellEvents.length > MAX_CHIPS ? cellEvents.length - MAX_CHIPS : 0;

          return React.createElement("div", {
            key: idx,
            style: {
              background: cell.thisMonth ? "var(--s1)" : "var(--bg)",
              minHeight: "80px", padding: "6px 8px",
              display: "flex", flexDirection: "column", gap: "3px",
            }
          },
            // Day number
            React.createElement("div", {
              style: {
                width: "22px", height: "22px",
                borderRadius: "50%",
                background: today ? "var(--ac)" : "transparent",
                color: today ? "var(--ac-on)" : cell.thisMonth ? "var(--t2)" : "var(--t5)",
                fontSize: "11px",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: today ? 600 : 400,
                flexShrink: 0,
              }
            }, cell.day),

            // Mobile: dots only. Desktop: chips with titles.
            isMobile()
              ? cellEvents.length > 0 && React.createElement("div", {
                  style: { display: "flex", flexWrap: "wrap", gap: "2px", marginTop: "2px" },
                  onClick: function () { onEventClick(cellEvents[0]); },
                },
                  cellEvents.slice(0, 3).map(function (ev, i) {
                    var c = chipColor(events.indexOf(ev));
                    return React.createElement("div", {
                      key: ev.id,
                      style: {
                        width: "5px", height: "5px", borderRadius: "50%",
                        background: c.color,
                        opacity: ev.status === "cancelled" ? 0.4 : 1,
                      }
                    });
                  })
                )
              : React.createElement(React.Fragment, null,
                  cellEvents.slice(0, MAX_CHIPS).map(function (ev, i) {
                    var c = chipColor(events.indexOf(ev));
                    return React.createElement("div", {
                      key: ev.id,
                      onClick: function () { onEventClick(ev); },
                      style: {
                        fontSize: "10px", padding: "2px 6px", borderRadius: "4px",
                        background: c.bg, color: c.color,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        cursor: "pointer",
                        opacity: ev.status === "cancelled" ? 0.5 : 1,
                      }
                    }, ev.title);
                  }),
                  overflow > 0 && React.createElement("div", {
                    style: { fontSize: "10px", color: "var(--t4)", cursor: "pointer" },
                    onClick: function () { onEventClick(cellEvents[MAX_CHIPS]); },
                  }, "+" + overflow + " more")
                )
          );
        })
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Weekly view
  // ---------------------------------------------------------------------------

  function WeeklyView({ events, weekStart, onEventClick }) {
    var days = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }

    var HOURS = [];
    for (var h = 8; h <= 20; h++) { HOURS.push(h); }
    var CELL_H = 48;

    var weekEvents = eventsInWeek(events, weekStart);

    // Mobile: stacked day list — the time grid is too wide for narrow viewports.
    if (isMobile()) {
      return React.createElement("div", {
        style: { display: "flex", flexDirection: "column", gap: "8px", paddingBottom: "24px" }
      },
        days.map(function (d) {
          var today = isToday(d);
          var dayEvents = weekEvents.filter(function (e) {
            return isSameDay(new Date(e.start_at), d);
          });

          return React.createElement("div", {
            key: d.toISOString(),
            style: {
              border: "0.5px solid var(--b1)", borderRadius: "10px",
              overflow: "hidden",
              background: today ? "rgba(167,139,250,0.04)" : "var(--s1)",
            }
          },
            // Day header
            React.createElement("div", {
              style: {
                display: "flex", alignItems: "center", gap: "10px",
                padding: "8px 12px",
                borderBottom: dayEvents.length > 0 ? "0.5px solid var(--b1)" : "none",
              }
            },
              React.createElement("div", {
                style: {
                  width: "28px", height: "28px", borderRadius: "50%",
                  background: today ? "var(--ac)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }
              },
                React.createElement("span", {
                  style: { fontSize: "13px", fontWeight: today ? 600 : 400,
                           color: today ? "var(--ac-on)" : "var(--t2)" }
                }, d.getDate())
              ),
              React.createElement("span", {
                style: { fontSize: "12px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.5px" }
              }, d.toLocaleDateString(undefined, { weekday: "short", month: "short" }))
            ),

            // Events for this day
            dayEvents.map(function (ev) {
              var c = chipColor(events.indexOf(ev));
              return React.createElement("div", {
                key: ev.id,
                onClick: function () { onEventClick(ev); },
                style: {
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "8px 12px",
                  cursor: "pointer",
                  borderTop: "0.5px solid var(--b1)",
                  opacity: ev.status === "cancelled" ? 0.5 : 1,
                }
              },
                React.createElement("div", {
                  style: { width: "3px", alignSelf: "stretch", borderRadius: "2px",
                           background: c.color, flexShrink: 0 }
                }),
                React.createElement("div", { style: { flex: 1, minWidth: 0 } },
                  React.createElement("div", {
                    style: { fontSize: "13px", fontWeight: 500, color: "var(--t1)",
                             overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
                  }, ev.title),
                  React.createElement("div", { style: { fontSize: "11px", color: "var(--t3)" } },
                    formatTime(ev.start_at), " – ", formatTime(ev.end_at)
                  )
                )
              );
            })
          );
        })
      );
    }

    return React.createElement("div", {
      style: {
        border: "0.5px solid var(--b1)", borderRadius: "12px",
        overflow: "hidden", marginBottom: "24px",
      }
    },
      // Header row
      React.createElement("div", {
        style: {
          display: "grid",
          gridTemplateColumns: "52px repeat(7, 1fr)",
          borderBottom: "0.5px solid var(--b1)",
        }
      },
        React.createElement("div", { style: { background: "var(--s1)" } }),
        days.map(function (d) {
          var today = isToday(d);
          return React.createElement("div", {
            key: d.toISOString(),
            style: {
              background: "var(--s1)", padding: "10px 0", textAlign: "center",
              borderLeft: "1px solid var(--b1)",
            }
          },
            React.createElement("div", {
              style: { fontSize: "10px", color: "var(--t3)", textTransform: "uppercase", letterSpacing: "0.5px" }
            }, d.toLocaleDateString(undefined, { weekday: "short" })),
            React.createElement("div", {
              style: {
                fontSize: "20px", fontWeight: 400, lineHeight: 1.2,
                color: today ? "var(--ac)" : "var(--t2)",
              }
            }, d.getDate())
          );
        })
      ),

      // Time grid
      React.createElement("div", { style: { position: "relative" } },
        HOURS.map(function (h) {
          return React.createElement("div", {
            key: h,
            style: {
              display: "grid",
              gridTemplateColumns: "52px repeat(7, 1fr)",
              borderBottom: "0.5px solid rgba(255,255,255,0.04)",
              height: CELL_H + "px",
            }
          },
            // Time label
            React.createElement("div", {
              style: {
                background: "var(--s1)", fontSize: "10px", color: "var(--t4)",
                textAlign: "right", paddingRight: "8px", paddingTop: "3px",
                flexShrink: 0,
              }
            }, h <= 12 ? h + " AM" : (h - 12) + " PM"),

            // Day cells
            days.map(function (d, di) {
              // Find events starting in this hour slot on this day
              var slotEvents = weekEvents.filter(function (e) {
                var start = new Date(e.start_at);
                return isSameDay(start, d) && start.getHours() === h;
              });

              return React.createElement("div", {
                key: di,
                style: {
                  background: "var(--s1)", borderLeft: "1px solid rgba(255,255,255,0.04)",
                  position: "relative", overflow: "visible",
                }
              },
                slotEvents.map(function (ev, i) {
                  var start = new Date(ev.start_at);
                  var end   = new Date(ev.end_at);
                  var durationH = Math.max(1, (end - start) / 3600000);
                  var heightPx  = Math.min(durationH, 4) * CELL_H - 4;
                  var c = chipColor(events.indexOf(ev));

                  return React.createElement("div", {
                    key: ev.id,
                    onClick: function () { onEventClick(ev); },
                    style: {
                      position: "absolute", top: "3px", left: "3px", right: "3px",
                      height: heightPx + "px",
                      background: c.bg,
                      borderLeft: "2.5px solid " + c.color,
                      borderRadius: "5px",
                      padding: "3px 6px",
                      fontSize: "10px", color: c.color,
                      overflow: "hidden", cursor: "pointer",
                      zIndex: 1,
                      opacity: ev.status === "cancelled" ? 0.5 : 1,
                    }
                  },
                    React.createElement("div", {
                      style: { fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }
                    }, ev.title),
                    React.createElement("div", { style: { fontSize: "9px", opacity: 0.8 } },
                      formatTime(ev.start_at)
                    )
                  );
                })
              );
            })
          );
        })
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Quarterly view
  // ---------------------------------------------------------------------------

  function QuarterlyView({ events, year, quarter, onEventClick }) {
    var startMonth = quarterStartMonth(quarter);
    var months = [startMonth, startMonth + 1, startMonth + 2];
    var today = new Date();

    // Flat event list for the quarter
    var qStart = new Date(year, startMonth, 1);
    var qEnd   = new Date(year, startMonth + 3, 0, 23, 59, 59);
    var qEvents = events.filter(function (e) {
      var s = new Date(e.start_at);
      return s >= qStart && s <= qEnd;
    }).sort(function (a, b) { return new Date(a.start_at) - new Date(b.start_at); });

    return React.createElement("div", { style: { paddingBottom: "24px" } },
      // Three mini-month grids — 3 columns on desktop, 1 column on mobile.
      React.createElement("div", {
        style: {
          display: "grid",
          gridTemplateColumns: isMobile() ? "1fr" : "repeat(3, 1fr)",
          gap: "12px",
          marginBottom: "20px",
        }
      },
        months.map(function (m) {
          var firstDay = startOfMonth(year, m).getDay();
          var days = daysInMonth(year, m);
          var cells = [];
          for (var i = 0; i < firstDay; i++) { cells.push({ day: null }); }
          for (var d = 1; d <= days; d++) { cells.push({ day: d }); }
          while (cells.length % 7 !== 0) { cells.push({ day: null }); }

          return React.createElement("div", {
            key: m,
            style: {
              background: "var(--s1)", border: "0.5px solid var(--b1)",
              borderRadius: "10px", padding: "12px",
            }
          },
            React.createElement("div", {
              style: { fontSize: "12px", fontWeight: 500, color: "var(--t2)", marginBottom: "8px" }
            }, new Date(year, m, 1).toLocaleDateString(undefined, { month: "long" })),

            React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "1px" } },
              ["S","M","T","W","T","F","S"].map(function (n, i) {
                return React.createElement("div", {
                  key: i,
                  style: { fontSize: "9px", color: "var(--t4)", textAlign: "center", padding: "2px 0" }
                }, n);
              }),

              cells.map(function (cell, idx) {
                if (!cell.day) {
                  return React.createElement("div", { key: idx, style: { height: "24px" } });
                }
                var dayDate = new Date(year, m, cell.day);
                var dayEvents = eventsOnDay(events, year, m, cell.day);
                var todayCell = isToday(dayDate);

                return React.createElement("div", {
                  key: idx,
                  style: {
                    height: "24px", display: "flex", alignItems: "center",
                    justifyContent: "center", borderRadius: "50%",
                    background: todayCell ? "var(--ac)" : "transparent",
                    cursor: dayEvents.length ? "pointer" : "default",
                    position: "relative",
                  },
                  onClick: dayEvents.length ? function () { onEventClick(dayEvents[0]); } : undefined,
                },
                  React.createElement("span", {
                    style: {
                      fontSize: "10px",
                      color: todayCell ? "var(--ac-on)" : dayEvents.length ? "var(--t1)" : "var(--t3)",
                      fontWeight: dayEvents.length ? 500 : 400,
                    }
                  }, cell.day),

                  // Dot indicator for events
                  dayEvents.length > 0 && !todayCell && React.createElement("div", {
                    style: {
                      position: "absolute", bottom: "2px", left: "50%",
                      transform: "translateX(-50%)",
                      width: "3px", height: "3px", borderRadius: "50%",
                      background: chipColor(0).color,
                    }
                  })
                );
              })
            )
          );
        })
      ),

      // Flat event list for the quarter
      qEvents.length > 0 && React.createElement("div", null,
        React.createElement("div", {
          style: {
            fontSize: "10px", fontWeight: 500, color: "var(--t4)",
            textTransform: "uppercase", letterSpacing: "0.8px",
            marginBottom: "8px",
          }
        }, "Events this quarter"),

        React.createElement("div", {
          style: { display: "flex", flexDirection: "column", gap: "4px" }
        },
          qEvents.map(function (ev) {
            var c = chipColor(events.indexOf(ev));
            return React.createElement("div", {
              key: ev.id,
              onClick: function () { onEventClick(ev); },
              style: {
                display: "flex", alignItems: "center", gap: "10px",
                padding: "8px 12px",
                background: "var(--s1)", border: "0.5px solid var(--b1)",
                borderRadius: "8px", cursor: "pointer",
                opacity: ev.status === "cancelled" ? 0.5 : 1,
              }
            },
              React.createElement("div", {
                style: {
                  width: "8px", height: "8px", borderRadius: "50%",
                  background: c.color, flexShrink: 0,
                }
              }),
              React.createElement("div", {
                style: { fontSize: "11px", color: "var(--t3)", width: "64px", flexShrink: 0 }
              }, formatShortDate(ev.start_at)),
              React.createElement("div", {
                style: { fontSize: "12px", color: "var(--t1)", flex: 1, minWidth: 0,
                         overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
              }, ev.title),
              React.createElement("div", {
                style: { fontSize: "11px", color: "var(--t4)", flexShrink: 0 }
              },
                ev.rsvp_counts
                  ? (ev.rsvp_counts.attending + " attending")
                  : ""
              )
            );
          })
        )
      ),

      qEvents.length === 0 && React.createElement("div", {
        style: { textAlign: "center", padding: "32px 0", fontSize: "13px", color: "var(--t4)" }
      }, "No events this quarter")
    );
  }

  // ---------------------------------------------------------------------------
  // CalendarPage — main route component for "/"
  // Props received from Nexus: { currentUser } (no path params on "/" route)
  // Navigation: window.NexusExtensions.navigate(url) per guide §9.3
  // ---------------------------------------------------------------------------

  function CalendarPage({ currentUser }) {
    var now  = new Date();

    var [view,       setView]       = useState("monthly");
    var [year,       setYear]       = useState(now.getFullYear());
    var [month,      setMonth]      = useState(now.getMonth());
    var [weekStart,  setWeekStart]  = useState(startOfWeekContaining(now));
    var [quarter,    setQuarter]    = useState(getQuarter(now.getFullYear(), now.getMonth()));
    var [qYear,      setQYear]      = useState(now.getFullYear());
    var [events,     setEvents]     = useState([]);
    var [loading,    setLoading]    = useState(true);
    var [perms,      setPerms]      = useState({});
    var [modalEvent, setModalEvent] = useState(null);

    // Fetch events and permissions on mount
    useEffect(function () {
      extFetch("/permissions").then(function (data) {
        if (data && data.permissions) setPerms(data.permissions);
      });

      extFetch("/events?filter=upcoming").then(function (data) {
        if (data && data.events) {
          setEvents(data.events);
        }
        setLoading(false);
      });
    }, []);

    // Navigation helpers
    function prevPeriod() {
      if (view === "monthly") {
        if (month === 0) { setMonth(11); setYear(function (y) { return y - 1; }); }
        else setMonth(function (m) { return m - 1; });
      } else if (view === "weekly") {
        setWeekStart(function (ws) {
          var d = new Date(ws); d.setDate(d.getDate() - 7); return d;
        });
      } else {
        if (quarter === 1) { setQuarter(4); setQYear(function (y) { return y - 1; }); }
        else setQuarter(function (q) { return q - 1; });
      }
    }

    function nextPeriod() {
      if (view === "monthly") {
        if (month === 11) { setMonth(0); setYear(function (y) { return y + 1; }); }
        else setMonth(function (m) { return m + 1; });
      } else if (view === "weekly") {
        setWeekStart(function (ws) {
          var d = new Date(ws); d.setDate(d.getDate() + 7); return d;
        });
      } else {
        if (quarter === 4) { setQuarter(1); setQYear(function (y) { return y + 1; }); }
        else setQuarter(function (q) { return q + 1; });
      }
    }

    function periodLabel() {
      if (view === "monthly")   return formatMonthYear(year, month);
      if (view === "weekly")    return formatWeekRange(weekStart);
      return formatQuarter(qYear, quarter);
    }

    return React.createElement("div", { style: { paddingTop: "20px", paddingBottom: "40px" } },

      // ── Calendar header ────────────────────────────────────────────────────
      React.createElement("div", {
        style: {
          display: "flex", alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap", gap: "10px",
          marginBottom: "16px",
        }
      },

        // Nav: arrows + period label
        React.createElement("div", {
          style: { display: "flex", alignItems: "center", gap: "10px" }
        },
          React.createElement("button", {
            onClick: prevPeriod,
            style: {
              width: "30px", height: "30px", borderRadius: "8px",
              border: "0.5px solid var(--b2)", background: "none",
              color: "var(--t3)", cursor: "pointer", fontSize: "12px",
              display: "flex", alignItems: "center", justifyContent: "center",
            },
            "aria-label": "Previous period",
          },
            React.createElement("i", { className: "fa-solid fa-chevron-left", "aria-hidden": "true" })
          ),
          React.createElement("span", {
            style: { fontSize: "15px", fontWeight: 500, color: "var(--t1)", minWidth: "160px" }
          }, periodLabel()),
          React.createElement("button", {
            onClick: nextPeriod,
            style: {
              width: "30px", height: "30px", borderRadius: "8px",
              border: "0.5px solid var(--b2)", background: "none",
              color: "var(--t3)", cursor: "pointer", fontSize: "12px",
              display: "flex", alignItems: "center", justifyContent: "center",
            },
            "aria-label": "Next period",
          },
            React.createElement("i", { className: "fa-solid fa-chevron-right", "aria-hidden": "true" })
          )
        ),

        // Right side: view pills + New event button
        React.createElement("div", {
          style: { display: "flex", alignItems: "center", gap: "10px" }
        },
          // View pills
          React.createElement("div", {
            style: {
              display: "flex", gap: "3px",
              background: "rgba(255,255,255,0.05)",
              borderRadius: "10px", padding: "3px",
            }
          },
            ["Weekly", "Monthly", "Quarterly"].map(function (v) {
              var active = view === v.toLowerCase();
              return React.createElement("button", {
                key: v,
                onClick: function () { setView(v.toLowerCase()); },
                style: {
                  fontSize: "11px", padding: "5px 12px", borderRadius: "7px",
                  border: "none", fontFamily: "inherit", cursor: "pointer",
                  background: active ? "rgba(167,139,250,0.18)" : "transparent",
                  color: active ? "var(--ac-text)" : "var(--t3)",
                  transition: "all 0.1s",
                }
              }, v);
            })
          ),

          // New event button — only shown if user has can_create_event permission
          perms.can_create_event && React.createElement("button", {
            className: "btn-primary",
            style: { fontSize: "12px", padding: "7px 14px", display: "flex", alignItems: "center", gap: "6px" },
            onClick: function () {
              mountCreateModal({
                currentUser: currentUser,
                onCreated: function (event) {
                  // Re-fetch events to show the new one immediately
                  extFetch("/events?filter=upcoming").then(function (data) {
                    if (data && data.events) setEvents(data.events);
                  });
                },
              });
            },
          },
            React.createElement("i", { className: "fa-solid fa-plus", style: { fontSize: "11px" }, "aria-hidden": "true" }),
            "New event"
          )
        )
      ),

      // ── Loading state ──────────────────────────────────────────────────────
      loading && React.createElement("div", {
        style: { textAlign: "center", padding: "48px 0", color: "var(--t4)", fontSize: "14px" }
      },
        React.createElement("i", { className: "fa-solid fa-spinner fa-spin", style: { marginRight: "8px" }, "aria-hidden": "true" }),
        "Loading events…"
      ),

      // ── Calendar views ─────────────────────────────────────────────────────
      !loading && view === "monthly" && React.createElement(MonthlyView, {
        events: events, year: year, month: month,
        canCreate: perms.can_create_event,
        onEventClick: setModalEvent,
        onNewEvent: function () {},
      }),

      !loading && view === "weekly" && React.createElement(WeeklyView, {
        events: events, weekStart: weekStart,
        onEventClick: setModalEvent,
      }),

      !loading && view === "quarterly" && React.createElement(QuarterlyView, {
        events: events, year: qYear, quarter: quarter,
        onEventClick: setModalEvent,
      }),

      // ── Event detail modal ─────────────────────────────────────────────────
      modalEvent && React.createElement(EventDetailModal, {
        event: modalEvent,
        currentUser: currentUser,
        onClose: function () { setModalEvent(null); },
      })
    );
  }

  // ---------------------------------------------------------------------------
  // EventDetailPage — route component for "/event/:id"
  // Props received: { id, currentUser }
  // ---------------------------------------------------------------------------

  function EventDetailPage({ id, currentUser }) {
    var [event,   setEvent]   = useState(null);
    var [loading, setLoading] = useState(true);
    var [notFound, setNotFound] = useState(false);

    useEffect(function () {
      extFetch("/events/" + id).then(function (data) {
        if (data && data.event) {
          setEvent(data.event);
        } else {
          setNotFound(true);
        }
        setLoading(false);
      });
    }, [id]);

    if (loading) {
      return React.createElement("div", {
        style: { textAlign: "center", padding: "48px 0", color: "var(--t4)", fontSize: "14px" }
      },
        React.createElement("i", { className: "fa-solid fa-spinner fa-spin", style: { marginRight: "8px" }, "aria-hidden": "true" }),
        "Loading…"
      );
    }

    if (notFound || !event) {
      return React.createElement("div", {
        style: { textAlign: "center", padding: "48px 0", color: "var(--t4)", fontSize: "14px" }
      }, "Event not found.");
    }

    // Render the event detail inline (not as a modal, since this is a full page)
    return React.createElement(EventDetailModal, {
      event: event,
      currentUser: currentUser,
      onClose: function () {
        window.NexusExtensions.navigate("/ext/nexus-events");
      },
    });
  }


  // ---------------------------------------------------------------------------
  // Admin panel — Stage 9
  // ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
  // AdminEventsView — Events tab content for the admin panel
  // Fetches events server-side, shows Upcoming/Past sort pills,
  // supports cancel and delete actions.
  // Component receives NO props — rendered via React.createElement(component, null)
  // per AdminExtensions.jsx line 1046.
  // ---------------------------------------------------------------------------

  function AdminEventsView() {
    var { toast } = window.NexusComponents;
    var [filter,   setFilter]   = useState("upcoming");
    var [events,   setEvents]   = useState([]);
    var [loading,  setLoading]  = useState(true);
    var [actionId, setActionId] = useState(null); // event id with pending action

    function loadEvents(f) {
      setLoading(true);
      extFetch("/events?filter=" + f).then(function (data) {
        if (data && data.events) setEvents(data.events);
        setLoading(false);
      });
    }

    useEffect(function () {
      loadEvents(filter);
    }, []);

    function switchFilter(f) {
      setFilter(f);
      loadEvents(f);
    }

    function handleCancel(event) {
      if (!window.confirm('Cancel "' + event.title + '"? All RSVPs will be notified.')) return;
      setActionId(event.id);
      extFetch("/events/" + event.id + "/cancel", { method: "POST" })
        .then(function (data) {
          if (data && data.event) {
            toast("Event cancelled.");
            loadEvents(filter);
            // Fire notifications via Nexus's intended endpoint (guide §9.12).
            // POST /api/v1/notifications/extension for each attendee.
            // This uses the Nexus notification pipeline correctly rather than
            // calling Oban directly from extension Elixir code.
            var attendeeIds = data.attendee_ids || [];
            var token = localStorage.getItem("nexus_token");
            attendeeIds.forEach(function (userId) {
              fetch("/api/v1/notifications/extension", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": "Bearer " + token,
                },
                body: JSON.stringify({
                  slug:           SLUG,
                  target_user_id: userId,
                  type:           "event_cancelled",
                  data: {
                    event_id:    String(data.event.id),
                    event_title: data.event.title,
                  },
                }),
              });
            });
          } else {
            toast("Could not cancel event.", "err");
          }
        })
        .finally(function () { setActionId(null); });
    }

    function handleDelete(event) {
      if (!window.confirm('Delete "' + event.title + '"? This cannot be undone.')) return;
      setActionId(event.id);
      extFetch("/events/" + event.id, { method: "DELETE" })
        .then(function (data) {
          if (data && data.ok) {
            toast("Event deleted.");
            loadEvents(filter);
          } else {
            toast("Could not delete event.", "err");
          }
        })
        .finally(function () { setActionId(null); });
    }

    var pillBase = {
      fontSize: "12px", padding: "5px 14px", borderRadius: "20px",
      border: "none", fontFamily: "inherit", cursor: "pointer",
      transition: "all 0.1s",
    };

    return React.createElement("div", { style: { paddingTop: "4px" } },

      // Sort pills
      React.createElement("div", {
        style: { display: "flex", gap: "6px", marginBottom: "16px" }
      },
        ["upcoming", "past"].map(function (f) {
          var active = filter === f;
          return React.createElement("button", {
            key: f,
            onClick: function () { switchFilter(f); },
            style: Object.assign({}, pillBase, {
              background: active ? "var(--ac-bg)" : "rgba(255,255,255,0.05)",
              color: active ? "var(--ac-text)" : "var(--t3)",
              border: active ? "0.5px solid var(--ac-border)" : "0.5px solid transparent",
            }),
          }, f.charAt(0).toUpperCase() + f.slice(1));
        })
      ),

      // Loading state
      loading && React.createElement("div", {
        style: { padding: "32px 0", textAlign: "center", color: "var(--t4)", fontSize: "13px" }
      },
        React.createElement("i", { className: "fa-solid fa-spinner fa-spin", style: { marginRight: "8px" }, "aria-hidden": "true" }),
        "Loading…"
      ),

      // Empty state
      !loading && events.length === 0 && React.createElement("div", {
        style: { padding: "32px 0", textAlign: "center", color: "var(--t4)", fontSize: "13px" }
      },
        filter === "upcoming"
          ? "No upcoming events."
          : "No past events."
      ),

      // Events table
      !loading && events.length > 0 && React.createElement("div", {
        style: { display: "flex", flexDirection: "column", gap: "6px" }
      },
        events.map(function (ev) {
          var isCancelled = ev.status === "cancelled";
          var isPending   = actionId === ev.id;

          return React.createElement("div", {
            key: ev.id,
            style: {
              display: "flex", alignItems: "center", gap: "12px",
              padding: "12px 14px",
              background: "var(--s1)",
              border: "0.5px solid var(--b1)",
              borderRadius: "10px",
              opacity: isCancelled ? 0.65 : 1,
            }
          },

            // Status dot
            React.createElement("div", {
              style: {
                width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0,
                background: isCancelled ? "var(--red)" : "var(--green)",
              }
            }),

            // Event info
            React.createElement("div", { style: { flex: 1, minWidth: 0 } },
              React.createElement("div", {
                style: {
                  fontSize: "13px", fontWeight: 500, color: "var(--t1)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }
              }, ev.title),
              React.createElement("div", {
                style: { fontSize: "11px", color: "var(--t3)", marginTop: "2px" }
              },
                formatShortDate(ev.start_at),
                " · ",
                formatTime(ev.start_at),
                isCancelled && React.createElement("span", {
                  style: { marginLeft: "8px", color: "var(--red)" }
                }, "Cancelled")
              )
            ),

            // RSVP count
            React.createElement("div", {
              style: { fontSize: "12px", color: "var(--t3)", flexShrink: 0 }
            },
              React.createElement("i", { className: "fa-solid fa-users", style: { marginRight: "4px", fontSize: "11px" }, "aria-hidden": "true" }),
              ev.attending_count !== undefined ? ev.attending_count : "—"
            ),

            // Actions
            React.createElement("div", {
              style: { display: "flex", gap: "6px", flexShrink: 0 }
            },
              // Cancel — only for upcoming events
              !isCancelled && filter === "upcoming" && React.createElement("button", {
                onClick: function () { handleCancel(ev); },
                disabled: isPending,
                style: {
                  fontSize: "11px", padding: "4px 10px", borderRadius: "6px",
                  background: "none", border: "0.5px solid rgba(255,255,255,0.1)",
                  color: "var(--t3)", cursor: isPending ? "wait" : "pointer",
                  fontFamily: "inherit",
                },
              }, isPending ? "…" : "Cancel"),

              // Delete
              React.createElement("button", {
                onClick: function () { handleDelete(ev); },
                disabled: isPending,
                style: {
                  fontSize: "11px", padding: "4px 10px", borderRadius: "6px",
                  background: "rgba(248,113,113,0.1)",
                  border: "0.5px solid rgba(248,113,113,0.2)",
                  color: "var(--red)", cursor: isPending ? "wait" : "pointer",
                  fontFamily: "inherit",
                },
              }, isPending ? "…" : "Delete")
            )
          );
        })
      )
    );
  }

  // ---------------------------------------------------------------------------
  // AdminPanelComponent — registered via registerAdminPanel
  // Uses TabbedPanel with a single Events tab.
  // Settings are handled by Nexus's auto-generated fallback form which renders
  // below this panel from settings_schema (confirmed in AdminExtensions.jsx).
  // Guide §9.4: "don't reach for these templates just to render settings_schema —
  // the host already does that automatically via its fallback form."
  // ---------------------------------------------------------------------------

  function AdminPanelComponent() {
    var { TabbedPanel } = window.NexusExtensionTemplates;

    return React.createElement(TabbedPanel, {
      tabs: [
        {
          key:    "events",
          label:  "Events",
          icon:   "fa-calendar",
          render: function () { return React.createElement(AdminEventsView); },
        },
      ],
    });
  }

  // ---------------------------------------------------------------------------
  // uploadImage — uses the Nexus upload endpoint per guide §9.15
  // POST /api/v1/uploads/ext/:slug — requires Bearer token + multipart/form-data
  // Do NOT set Content-Type manually — browser sets the multipart boundary.
  // ---------------------------------------------------------------------------

  function uploadImage(file) {
    var token = localStorage.getItem("nexus_token");
    var body  = new FormData();
    body.append("file", file);
    body.append("type", "extension_image");

    return fetch("/api/v1/uploads/ext/" + SLUG, {
      method:  "POST",
      headers: { "Authorization": "Bearer " + token },
      body:    body,
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || "Upload failed");
        return data;
      });
    });
  }

  // ---------------------------------------------------------------------------
  // CreateEventModal
  // Mounted into a portal div on document.body via ReactDOM.createRoot.
  // This is necessary because onClick on a toolbar button is a plain function
  // call — not a React render context — so we cannot use React state directly.
  // Per guide §9.7: onClick receives {attach, currentUser, context}.
  // After event creation, attach() queues the event_id with the in-flight
  // composition. Nexus dispatches to persist_attachment/3 after the post
  // is committed, linking the event to the new post_id.
  // ---------------------------------------------------------------------------

  function CreateEventModal({ currentUser, onClose, onCreated }) {
    var { toast } = window.NexusComponents;

    var [title,        setTitle]        = useState("");
    var [description,  setDescription]  = useState("");
    var [location,     setLocation]     = useState("");
    var [startAt,      setStartAt]      = useState("");
    var [endAt,        setEndAt]        = useState("");
    var [rsvpEnabled,  setRsvpEnabled]  = useState(true);
    var [imageUrl,     setImageUrl]     = useState("");
    var [uploading,    setUploading]    = useState(false);
    var [submitting,   setSubmitting]   = useState(false);
    var [errors,       setErrors]       = useState({});

    function toIso(localDt) {
      // datetime-local value is local time ("2026-08-01T14:00").
      // new Date(localDt).toISOString() converts to UTC ISO 8601.
      if (!localDt) return null;
      var d = new Date(localDt);
      return isNaN(d.getTime()) ? null : d.toISOString();
    }

    function validate() {
      var errs = {};
      if (!title.trim())  errs.title    = "Title is required";
      if (!startAt)       errs.start_at = "Start time is required";
      if (!endAt)         errs.end_at   = "End time is required";
      if (startAt && endAt && new Date(endAt) <= new Date(startAt)) {
        errs.end_at = "End time must be after start time";
      }
      return errs;
    }

    function handleImageChange(e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      setUploading(true);
      uploadImage(file)
        .then(function (data) {
          setImageUrl(data.url || "");
          toast("Image uploaded.");
        })
        .catch(function (err) {
          toast(err.message || "Image upload failed.", "err");
        })
        .finally(function () {
          setUploading(false);
        });
    }

    function handleSubmit() {
      var errs = validate();
      if (Object.keys(errs).length > 0) {
        setErrors(errs);
        return;
      }
      setSubmitting(true);
      setErrors({});

      var payload = {
        title:        title.trim(),
        description:  description.trim() || null,
        location:     location.trim()    || null,
        image_url:    imageUrl           || null,
        start_at:     toIso(startAt),
        end_at:       toIso(endAt),
        rsvp_enabled: rsvpEnabled,
      };

      extFetch("/events", {
        method: "POST",
        body:   JSON.stringify(payload),
      }).then(function (data) {
        if (data && data.event) {
          toast("Event created!");
          if (onCreated) onCreated(data.event);
          onClose();
        } else if (data && data.errors) {
          setErrors(data.errors);
          toast("Please fix the errors below.", "err");
        } else {
          toast("Failed to create event. Please try again.", "err");
        }
      }).finally(function () {
        setSubmitting(false);
      });
    }

    var labelStyle = {
      display: "block",
      fontSize: "12px",
      fontWeight: 500,
      color: "var(--t3)",
      marginBottom: "5px",
    };

    var inputStyle = {
      width: "100%",
      padding: "8px 12px",
      fontSize: "13px",
      background: "rgba(255,255,255,0.05)",
      border: "0.5px solid",
      borderColor: "rgba(255,255,255,0.1)",
      borderRadius: "8px",
      color: "var(--t1)",
      fontFamily: "inherit",
      boxSizing: "border-box",
    };

    var errorStyle = {
      fontSize: "11px",
      color: "var(--red)",
      marginTop: "3px",
    };

    var fieldStyle = { marginBottom: "14px" };

    return React.createElement("div", {
      style: {
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      },
      onClick: function (e) { if (e.target === e.currentTarget) onClose(); },
    },
      React.createElement("div", {
        style: {
          background: "var(--s2)",
          border: "0.5px solid var(--b2)",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "520px",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        },
        onClick: function (e) { e.stopPropagation(); },
      },

        // Header
        React.createElement("div", {
          style: {
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "20px 24px 0",
          }
        },
          React.createElement("h2", {
            style: { fontSize: "16px", fontWeight: 600, color: "var(--t1)", margin: 0 }
          }, "Create event"),
          React.createElement("button", {
            onClick: onClose,
            style: {
              background: "none", border: "none", cursor: "pointer",
              color: "var(--t3)", fontSize: "18px", lineHeight: 1, padding: "4px",
            },
            "aria-label": "Close",
          },
            React.createElement("i", { className: "fa-solid fa-xmark", "aria-hidden": "true" })
          )
        ),

        // Form body
        React.createElement("div", { style: { padding: "20px 24px 24px" } },

          // Title
          React.createElement("div", { style: fieldStyle },
            React.createElement("label", { style: labelStyle }, "Event name *"),
            React.createElement("input", {
              type: "text",
              value: title,
              onChange: function (e) { setTitle(e.target.value); setErrors(function(p) { return Object.assign({}, p, {title: null}); }); },
              placeholder: "Give your event a name",
              style: Object.assign({}, inputStyle, errors.title ? { borderColor: "var(--red)" } : {}),
              maxLength: 200,
            }),
            errors.title && React.createElement("div", { style: errorStyle }, errors.title)
          ),

          // Date/time row
          React.createElement("div", {
            style: Object.assign({}, fieldStyle, { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" })
          },
            React.createElement("div", null,
              React.createElement("label", { style: labelStyle }, "Start *"),
              React.createElement("input", {
                type: "datetime-local",
                value: startAt,
                onChange: function (e) { setStartAt(e.target.value); setErrors(function(p) { return Object.assign({}, p, {start_at: null}); }); },
                style: Object.assign({}, inputStyle, errors.start_at ? { borderColor: "var(--red)" } : {}),
              }),
              errors.start_at && React.createElement("div", { style: errorStyle }, errors.start_at)
            ),
            React.createElement("div", null,
              React.createElement("label", { style: labelStyle }, "End *"),
              React.createElement("input", {
                type: "datetime-local",
                value: endAt,
                onChange: function (e) { setEndAt(e.target.value); setErrors(function(p) { return Object.assign({}, p, {end_at: null}); }); },
                style: Object.assign({}, inputStyle, errors.end_at ? { borderColor: "var(--red)" } : {}),
              }),
              errors.end_at && React.createElement("div", { style: errorStyle }, errors.end_at)
            )
          ),

          // Location
          React.createElement("div", { style: fieldStyle },
            React.createElement("label", { style: labelStyle }, "Location"),
            React.createElement("input", {
              type: "text",
              value: location,
              onChange: function (e) { setLocation(e.target.value); },
              placeholder: "Where is this event?",
              style: inputStyle,
            })
          ),

          // Description
          React.createElement("div", { style: fieldStyle },
            React.createElement("label", { style: labelStyle }, "Description"),
            React.createElement("textarea", {
              value: description,
              onChange: function (e) { setDescription(e.target.value); },
              placeholder: "Tell people about this event (optional)",
              rows: 3,
              style: Object.assign({}, inputStyle, { resize: "vertical", lineHeight: 1.5 }),
            })
          ),

          // Cover image
          React.createElement("div", { style: fieldStyle },
            React.createElement("label", { style: labelStyle }, "Cover image"),
            imageUrl
              ? React.createElement("div", { style: { position: "relative", marginBottom: "8px" } },
                  React.createElement("img", {
                    src: imageUrl, alt: "Cover",
                    style: { width: "100%", height: "120px", objectFit: "cover", borderRadius: "8px", display: "block" }
                  }),
                  React.createElement("button", {
                    onClick: function () { setImageUrl(""); },
                    style: {
                      position: "absolute", top: "6px", right: "6px",
                      background: "rgba(0,0,0,0.6)", border: "none",
                      borderRadius: "50%", width: "24px", height: "24px",
                      cursor: "pointer", color: "#fff", fontSize: "12px",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    },
                    "aria-label": "Remove image",
                  },
                    React.createElement("i", { className: "fa-solid fa-xmark", "aria-hidden": "true" })
                  )
                )
              : React.createElement("label", {
                  style: {
                    display: "flex", alignItems: "center", gap: "8px",
                    padding: "10px 14px", borderRadius: "8px",
                    border: "0.5px dashed rgba(255,255,255,0.15)",
                    cursor: uploading ? "wait" : "pointer",
                    color: "var(--t3)", fontSize: "13px",
                  }
                },
                  React.createElement("i", {
                    className: uploading ? "fa-solid fa-spinner fa-spin" : "fa-solid fa-image",
                    "aria-hidden": "true",
                  }),
                  uploading ? "Uploading…" : "Choose cover image",
                  React.createElement("input", {
                    type: "file",
                    accept: "image/jpeg,image/png,image/gif,image/webp",
                    onChange: handleImageChange,
                    disabled: uploading,
                    style: { display: "none" },
                  })
                )
          ),

          // RSVP toggle
          React.createElement("div", {
            style: Object.assign({}, fieldStyle, {
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 14px",
              background: "rgba(255,255,255,0.03)",
              border: "0.5px solid var(--b1)",
              borderRadius: "8px",
            })
          },
            React.createElement("div", null,
              React.createElement("div", { style: { fontSize: "13px", color: "var(--t1)", fontWeight: 500 } }, "Enable RSVP"),
              React.createElement("div", { style: { fontSize: "11px", color: "var(--t3)" } }, "Let members RSVP to this event")
            ),
            // Use NexusComponents.Toggle per guide §9.14.2
            React.createElement(window.NexusComponents.Toggle, {
              value: rsvpEnabled,
              onChange: setRsvpEnabled,
            })
          ),

          // Action row
          React.createElement("div", {
            style: {
              display: "flex", justifyContent: "flex-end", gap: "8px",
              marginTop: "20px",
            }
          },
            React.createElement("button", {
              className: "btn-ghost",
              onClick: onClose,
              disabled: submitting,
            }, "Cancel"),
            React.createElement("button", {
              className: "btn-primary",
              onClick: handleSubmit,
              disabled: submitting || uploading,
            }, submitting ? "Creating…" : "Create event")
          )
        )
      )
    );
  }

  // ---------------------------------------------------------------------------
  // mountCreateModal — mounts CreateEventModal into a portal on document.body.
  // Called from the toolbar button's onClick. Returns an unmount function.
  // This pattern is necessary because onClick is a plain function call,
  // not a React render context — guide §9.7.
  // ---------------------------------------------------------------------------

  function mountCreateModal(props) {
    var container = document.createElement("div");
    container.id  = "nexus-events-create-modal";
    document.body.appendChild(container);

    var root = window.ReactDOM.createRoot(container);

    function unmount() {
      root.unmount();
      if (container.parentNode) container.parentNode.removeChild(container);
    }

    root.render(
      React.createElement(CreateEventModal, Object.assign({}, props, {
        onClose: function () {
          if (props.onClose) props.onClose();
          unmount();
        },
      }))
    );

    return unmount;
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
    onClick: function (_ref) {
      var currentUser = _ref ? _ref.currentUser : null;
      var attach      = _ref ? _ref.attach      : null;
      mountCreateModal({
        currentUser: currentUser,
        onCreated: function (event) {
          // attach() queues the event_id with the in-flight post composition.
          // Nexus dispatches to persist_attachment/3 after the post is committed,
          // which sets event.post_id to the new post's id.
          // Per guide §9.7: attach({kind, data}) — kind must match manifest side_data.
          if (attach) {
            attach({ kind: "event_attach", data: { event_id: String(event.id) } });
          }
        },
      });
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
      // _ref receives { n, navigate } per NotificationsPage.jsx line 114.
      // Navigate to the calendar page. The event is cancelled so no detail
      // page is needed — the calendar shows its current status.
      window.NexusExtensions.navigate("/ext/nexus-events");
    },
  });

})();
