(function () {
  "use strict";

  const NE   = window.NexusExtensions;
  const SLUG = "nexus-events";

  // ── Placeholder components ────────────────────────────────────────────────
  // Real implementations replace these in later stages. Each function is a
  // valid React component returning null so registrations succeed without
  // rendering anything yet.

  function CalendarPage() {
    return null; // Stage 7
  }

  function EventDetailPage() {
    return null; // Stage 7
  }

  function PostFooterCard() {
    return null; // Stage 6
  }

  function AdminPanelComponent() {
    return null; // Stage 9
  }

  function RightWidgetPlaceholder() {
    return null;
  }

  // ── Routes ───────────────────────────────────────────────────────────────
  // Declared in manifest: routes[0] path "/" and routes[1] path "/event/:id"

  NE.registerRoute(SLUG, "/", CalendarPage, { title: "Events" });
  NE.registerRoute(SLUG, "/event/:id", EventDetailPage, { title: "Event" });

  // ── Slots ────────────────────────────────────────────────────────────────
  // Declared in manifest: slots ["post_footer"]

  NE.registerSlot({
    slug:      SLUG,
    slot:      "post_footer",
    component: PostFooterCard,
    priority:  50
  });

  // ── Admin panel ──────────────────────────────────────────────────────────
  // Declared in manifest: admin_panel { label: "Events", icon: "fa-calendar" }

  NE.registerAdminPanel(SLUG, {
    label:     "Events",
    icon:      "fa-calendar",
    component: AdminPanelComponent
  });

  // ── Explore item ─────────────────────────────────────────────────────────
  // Declared in manifest: explore { label: "Events", icon: "fa-calendar", path: "/" }

  NE.registerExploreItem({
    slug:  SLUG,
    path:  "/",
    label: "Events",
    icon:  "fa-calendar"
  });

  // ── Toolbar button ───────────────────────────────────────────────────────
  // Declared in manifest: toolbar_buttons[0] id "create-event", scope "posts"
  // Note: icon uses full FA class as required by toolbar_buttons (guide §7.6)

  NE.registerToolbarButton({
    slug:  SLUG,
    id:    "create-event",
    icon:  "fa-solid fa-calendar-plus",
    tip:   "Create an event",
    scope: "posts",
    onClick: function () {
      // Stage 8: open CreateEventModal
    }
  });

  // ── Notification type ────────────────────────────────────────────────────
  // Declared in manifest: notification_types[0] key "event_cancelled"

  NE.registerNotificationType("event_cancelled", {
    icon:      "fa-calendar-xmark",
    iconColor: "var(--red)",
    renderBody: function (n) {
      return React.createElement(
        React.Fragment,
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
      // Stage 10: navigate to event or calendar
    }
  });

})();
