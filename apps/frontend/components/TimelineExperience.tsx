import React, { useEffect, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import { DateTime } from "luxon";
import type { CampusEvent, TimelineItem, TimelineView } from "@gobbler/shared";
import { backend } from "../services/backend";
import { eventCardPhotos } from "./event-presentation";
import { Button } from "./ui";

type Phase =
  "intro" | "select" | "collapse" | "expand" | "populating" | "ready";
type Range = { anchor: number; end: number };
const INTRO_KEY = "gobbler.timeline.intro.v1";
const formatDay = (day: string, fmt = "ccc, LLL d") =>
  DateTime.fromISO(day).toFormat(fmt);
const timeLabel = (item: TimelineItem, timezone: string) => {
  const e = item.recommendation.event;
  return e.timeTBD
    ? "Time to be announced"
    : e.allDay
      ? "All day"
      : DateTime.fromISO(e.start).setZone(timezone).toFormat("h:mm a");
};
const initialPhase = (): Phase => {
  if (Platform.OS !== "web") return "select";
  try {
    return sessionStorage.getItem(INTRO_KEY) ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "select"
      : "intro";
  } catch {
    return "select";
  }
};

/** Presentation and untrusted date-range draft only. The typed backend owns all
 * dates, eligibility, interest matching, curation and chronological ordering.
 * Existing callbacks handle authenticated Save/Details/Calendar user intents. */
export function TimelineExperience({
  active,
  saved,
  busy,
  onSave,
  onDetails,
  onCalendar,
  onDiscover,
}: {
  active: boolean;
  saved: string[];
  busy: boolean;
  onSave: (event: CampusEvent) => void;
  onDetails: (event: CampusEvent, reason?: string) => void;
  onCalendar: (event: CampusEvent, reason?: string) => void;
  onDiscover: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [view, setView] = useState<TimelineView | null>(null);
  const [draft, setDraft] = useState<Range | null>(null);
  const [error, setError] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [vertical, setVertical] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [pinned, setPinned] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const dragging = useRef<Range | null>(null);
  const pan = useRef<{ y: number; top: number; moved: boolean } | null>(null);
  const generation = useRef(0);
  const introStarted = useRef(false);
  const alive = useRef(true);
  const firstDayButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const after = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
      timers.current.forEach(clearTimeout);
    };
  }, []);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const orientation = matchMedia(
      "(max-width: 799px) and (orientation: portrait)",
    );
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setVertical(orientation.matches);
      setReduced(motion.matches);
    };
    sync();
    orientation.addEventListener("change", sync);
    motion.addEventListener("change", sync);
    return () => {
      orientation.removeEventListener("change", sync);
      motion.removeEventListener("change", sync);
    };
  }, []);
  useEffect(() => {
    if (phase !== "intro") return;
    if (!active) {
      if (introStarted.current) setPhase("select");
      return;
    }
    introStarted.current = true;
    try {
      sessionStorage.setItem(INTRO_KEY, "seen");
    } catch {
      /* Storage is optional UI state. */
    }
    const timer = setTimeout(() => setPhase("select"), reduced ? 0 : 1950);
    return () => clearTimeout(timer);
  }, [active, phase, reduced]);
  useEffect(() => {
    if (!active || view) return;
    const request = ++generation.current;
    setRequesting(true);
    setError("");
    backend
      .timeline({})
      .then((result) => {
        if (alive.current && request === generation.current) setView(result);
      })
      .catch((e) => {
        if (alive.current && request === generation.current)
          setError(
            e instanceof Error
              ? e.message
              : "Your timeline is unavailable. Please try again.",
          );
      })
      .finally(() => {
        if (alive.current && request === generation.current)
          setRequesting(false);
      });
    return () => {
      generation.current++;
    };
  }, [active, attempt, view === null]);

  useEffect(() => {
    if (!vertical || !pinned) return;
    const frame = requestAnimationFrame(() => {
      const extra = document.getElementById(`timeline-extra-${pinned}`);
      if (!extra || !scroller.current) return;
      const box = extra.getBoundingClientRect(),
        viewport = scroller.current.getBoundingClientRect();
      const delta =
        box.bottom > viewport.bottom - 20
          ? box.bottom - viewport.bottom + 20
          : box.top < viewport.top + 20
            ? box.top - viewport.top - 20
            : 0;
      if (delta)
        scroller.current.scrollBy({
          top: delta,
          behavior: reduced ? "auto" : "smooth",
        });
    });
    return () => cancelAnimationFrame(frame);
  }, [pinned, vertical, reduced]);

  const start = draft ? Math.min(draft.anchor, draft.end) : 0;
  const end = draft ? Math.max(draft.anchor, draft.end) : 6;
  const populated = phase === "populating" || phase === "ready";
  const selecting = phase === "select";
  const openId = pinned || hovered;
  const selectionLabel =
    view && draft
      ? start === end
        ? formatDay(view.days[start])
        : `${formatDay(view.days[start])} – ${formatDay(view.days[end])}`
      : "";
  const indexAt = (event: React.PointerEvent) => {
    const bounds = track.current!.getBoundingClientRect();
    const fraction = vertical
      ? (event.clientY - bounds.top) / bounds.height
      : (event.clientX - bounds.left) / bounds.width;
    return Math.max(0, Math.min(6, Math.round(fraction * 6)));
  };
  const chooseDay = (index: number) => {
    setDraft((current) =>
      current
        ? { anchor: current.anchor, end: index }
        : { anchor: index, end: index },
    );
  };
  const confirm = async (keyboard = false) => {
    if (!view || !draft || requesting || !selecting) return;
    const input = { startDate: view.days[start], endDate: view.days[end] };
    const request = ++generation.current;
    setRequesting(true);
    setError("");
    setPhase("collapse");
    setPinned(null);
    setHovered(null);
    try {
      const [result] = await Promise.all([
        backend.timeline(input),
        new Promise((resolve) => setTimeout(resolve, reduced ? 0 : 650)),
      ]);
      if (!alive.current || request !== generation.current) return;
      setView(result);
      // Keep the draft's visual positions aligned if the campus day rolled over
      // during the request. The backend selection remains authoritative.
      if (result.selection)
        setDraft({
          anchor: result.days.indexOf(result.selection.startDate),
          end: result.days.indexOf(result.selection.endDate),
        });
      setRequesting(false);
      setPhase("expand");
      after(
        () => {
          setPhase("populating");
          after(
            () => {
              setPhase("ready");
              if (keyboard)
                scroller.current
                  ?.querySelector<HTMLButtonElement>(".tl-bubble-trigger")
                  ?.focus({ preventScroll: true });
            },
            reduced ? 0 : 1350,
          );
        },
        reduced ? 0 : 620,
      );
    } catch (e) {
      if (!alive.current || request !== generation.current) return;
      setError(
        e instanceof Error
          ? e.message
          : "We couldn't load those days. Please try again.",
      );
      setPhase("select");
      setRequesting(false);
    }
  };
  const changeDates = () => {
    generation.current++;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPhase("select");
    setView(null);
    setDraft(null);
    setPinned(null);
    setHovered(null);
    setAttempt((n) => n + 1);
    after(() => firstDayButton.current?.focus({ preventScroll: true }), 200);
  };

  if (Platform.OS !== "web")
    return (
      <View style={{ gap: 16 }}>
        <Text>
          The interactive timeline is available on the website. Explore all
          upcoming events below.
        </Text>
        <Button label="Discover more" onPress={onDiscover} />
      </View>
    );

  return (
    <section
      className={`timeline-experience tl-${phase} ${vertical ? "tl-vertical" : "tl-horizontal"}`}
      aria-label="Your campus timeline"
      data-testid="cinematic-timeline"
      data-phase={phase}
      onPointerDown={(event) => {
        if (!(event.target as HTMLElement).closest("[data-timeline-bubble]")) {
          setPinned(null);
          setHovered(null);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setPinned(null);
          setHovered(null);
        }
      }}
    >
      <header className="tl-heading">
        <h1>Your featured timeline.</h1>
        <p className="tl-subtitle">
          {populated
            ? `${selectionLabel} · ${view?.items.length || 0} events`
            : "Select a date range to see featured events."}
        </p>
      </header>

      {populated && vertical && (
        <p className="tl-scroll-hint">Swipe or drag to explore</p>
      )}
      <div
        ref={scroller}
        className={`tl-scroller ${populated ? "is-populated" : ""}`}
        tabIndex={populated ? 0 : -1}
        aria-label={
          populated
            ? "Selected events in chronological order; scroll to explore"
            : "Choose your days"
        }
        onPointerDown={(event) => {
          if (
            !vertical ||
            !populated ||
            (event.target as HTMLElement).closest("button")
          )
            return;
          pan.current = {
            y: event.clientY,
            top: event.currentTarget.scrollTop,
            moved: false,
          };
          if (event.pointerType === "mouse")
            event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!pan.current || event.pointerType !== "mouse") return;
          const distance = event.clientY - pan.current.y;
          if (Math.abs(distance) > 4) pan.current.moved = true;
          event.currentTarget.scrollTop = pan.current.top - distance;
        }}
        onPointerUp={() => {
          pan.current = null;
        }}
        onPointerCancel={() => {
          pan.current = null;
        }}
      >
        <div
          className={`tl-world ${populated ? "has-events" : ""}`}
          style={
            {
              "--event-count": Math.max(1, view?.items.length || 0),
            } as React.CSSProperties
          }
        >
          <div
            className="tl-axis"
            aria-hidden="true"
            style={
              {
                "--line-start":
                  phase === "collapse" ? `${(start / 6) * 100}%` : "0%",
                "--line-size":
                  phase === "collapse"
                    ? `${Math.max(0.5, ((end - start) / 6) * 100)}%`
                    : "100%",
              } as React.CSSProperties
            }
          >
            <div className="tl-axis-base" />
            <div className="tl-origin">
              <i />
            </div>
            {selecting && draft && (
              <div
                className="tl-range-glow"
                style={
                  {
                    "--start": `${(start / 6) * 100}%`,
                    "--size": `${((end - start) / 6) * 100}%`,
                  } as React.CSSProperties
                }
              />
            )}
          </div>

          {!populated && (
            <div
              ref={track}
              className="tl-selector-track"
              onPointerDown={(event) => {
                if (!selecting || !view || requesting || event.button !== 0)
                  return;
                const index = indexAt(event);
                dragging.current = { anchor: index, end: index };
                setDraft(dragging.current);
                event.currentTarget.setPointerCapture(event.pointerId);
                event.preventDefault();
              }}
              onPointerMove={(event) => {
                if (!dragging.current) return;
                dragging.current = { ...dragging.current, end: indexAt(event) };
                setDraft(dragging.current);
              }}
              onPointerUp={(event) => {
                if (!dragging.current) return;
                setDraft({ ...dragging.current, end: indexAt(event) });
                dragging.current = null;
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                dragging.current = null;
              }}
            >
              {view?.days.map((day, index) => {
                const inside = !!draft && index >= start && index <= end;
                const major = index === 0 || index === 2 || index === 6;
                const expanding = phase === "expand";
                const position = expanding
                  ? start === end
                    ? 50
                    : Math.max(
                        0,
                        Math.min(100, ((index - start) / (end - start)) * 100),
                      )
                  : phase === "collapse"
                    ? (Math.max(start, Math.min(end, index)) / 6) * 100
                    : (index / 6) * 100;
                return (
                  <button
                    key={day}
                    ref={index === 0 ? firstDayButton : undefined}
                    type="button"
                    className={`tl-day ${major ? "major" : ""} ${inside ? "chosen" : ""} ${(phase === "collapse" || expanding) && !inside ? "vanish" : ""}`}
                    style={
                      { "--position": `${position}%` } as React.CSSProperties
                    }
                    aria-label={`${index === 0 ? "Today, " : ""}${formatDay(day)}. Select a range endpoint.`}
                    aria-pressed={inside}
                    disabled={!selecting || requesting}
                    onClick={(event) => {
                      if (event.detail === 0) chooseDay(index);
                    }}
                    onKeyDown={(event) => {
                      const next =
                        event.key === "ArrowRight" || event.key === "ArrowDown"
                          ? Math.min(6, index + 1)
                          : event.key === "ArrowLeft" || event.key === "ArrowUp"
                            ? Math.max(0, index - 1)
                            : event.key === "Home"
                              ? 0
                              : event.key === "End"
                                ? 6
                                : null;
                      if (next !== null) {
                        event.preventDefault();
                        if (event.shiftKey)
                          setDraft((current) => ({
                            anchor: current?.anchor ?? index,
                            end: next,
                          }));
                        track.current
                          ?.querySelectorAll<HTMLButtonElement>("button")
                          [next]?.focus();
                      }
                    }}
                  >
                    <span className="tl-day-caption">
                      {index === 0
                        ? "Today"
                        : index === 2
                          ? "3 days"
                          : index === 6
                            ? "1 week"
                            : formatDay(day, "ccc")}
                    </span>
                    <span className="tl-tick">
                      <i />
                    </span>
                    <span className="tl-day-date">
                      {formatDay(day, "LLL d")}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {populated && (
            <div className="tl-events" role="list" aria-label="Curated events">
              {view?.items.map((item, index) => {
                const event = item.recommendation.event,
                  isOpen = openId === event.id;
                const { cover, fallback } = eventCardPhotos(event);
                return (
                  <article
                    key={event.id}
                    role="listitem"
                    data-timeline-bubble
                    data-testid="timeline-bubble"
                    className={`tl-event ${index % 2 ? "side-b" : "side-a"} ${isOpen ? "is-open" : ""} ${item.matchedInterests.length ? "is-match" : ""}`}
                    style={
                      {
                        "--position": `${((index + 0.5) / view.items.length) * 100}%`,
                        "--delay": `${index * 75}ms`,
                      } as React.CSSProperties
                    }
                    onMouseEnter={() => setHovered(event.id)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(event.id)}
                    onBlur={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget))
                        setHovered(null);
                    }}
                  >
                    <div className="tl-event-dot" aria-hidden="true" />
                    <div className="tl-stem" aria-hidden="true" />
                    <span className="tl-event-date">
                      {DateTime.fromISO(event.start)
                        .setZone(view.timezone)
                        .toFormat("ccc d")}
                    </span>
                    <div className="tl-bubble">
                      <button
                        className="tl-bubble-trigger"
                        aria-expanded={isOpen}
                        aria-controls={`timeline-extra-${event.id}`}
                        aria-label={`${event.title}. ${DateTime.fromISO(event.start).setZone(view.timezone).toFormat("ccc, LLL d")}, ${timeLabel(item, view.timezone)}. ${item.matchedInterests.length ? "Matches your interests." : "Something to explore."} Expand event.`}
                        onClick={() => {
                          if (pinned === event.id)
                            onDetails(event, item.recommendation.reason);
                          else setPinned(event.id);
                        }}
                      >
                        <span className="tl-bubble-time">
                          {timeLabel(item, view.timezone)}
                        </span>
                        <span className="tl-bubble-title">{event.title}</span>
                        <span className="tl-match">
                          <i aria-hidden="true" />
                          {item.matchedInterests.length
                            ? "Your kind of thing"
                            : event.categories[0] || "Campus life"}
                        </span>
                      </button>
                      <div
                        id={`timeline-extra-${event.id}`}
                        className="tl-bubble-extra"
                        hidden={!isOpen}
                      >
                        <div className="tl-extra-heading">
                          <img
                            src={cover.url}
                            alt={cover.alt || event.title}
                            width="40"
                            height="40"
                            loading="lazy"
                            onError={(e) => {
                              if (
                                e.currentTarget.getAttribute("src") !==
                                fallback.url
                              )
                                e.currentTarget.src = fallback.url;
                            }}
                          />
                          <p>
                            {event.location || "Location available at source"}
                          </p>
                        </div>
                        <p className="tl-fit">
                          {item.recommendation.fit.status === "free"
                            ? "✓ Fits your availability"
                            : item.recommendation.fit.status === "conflict"
                              ? "Schedule conflict"
                              : "Availability unknown"}
                        </p>
                        <p className="tl-explanation">
                          {item.recommendation.reason}
                        </p>
                        <div className="tl-bubble-actions">
                          <button
                            disabled={busy}
                            aria-pressed={saved.includes(event.id)}
                            aria-label={`${saved.includes(event.id) ? "Unsave" : "Save"} ${event.title}`}
                            onClick={() => onSave(event)}
                          >
                            {saved.includes(event.id) ? "Saved ✓" : "Save"}
                          </button>
                          <button
                            aria-label={`Details for ${event.title}`}
                            onClick={() =>
                              onDetails(event, item.recommendation.reason)
                            }
                          >
                            Details ↗
                          </button>
                          <button
                            aria-label={`Add ${event.title} to calendar`}
                            onClick={() =>
                              onCalendar(event, item.recommendation.reason)
                            }
                          >
                            Calendar +
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {populated && !view?.items.length && (
            <div className="tl-no-events">
              <p>A little breathing room.</p>
              <span>
                No upcoming events were found for these days. Try another range
                or discover more.
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="tl-controls">
        {(selecting || phase === "intro") && (
          <>
            <p className="tl-instruction">
              {draft ? selectionLabel : "Drag to select your timeline"}
            </p>
            <p className="tl-hint">
              {draft
                ? "Whole days. Your choice."
                : "Start anywhere. Choose a day or a few."}
            </p>
            <div className="tl-confirm-slot">
              <button
                ref={confirmButton}
                className="tl-confirm"
                disabled={!draft || requesting || !selecting}
                onClick={(event) => void confirm(event.detail === 0)}
              >
                {requesting ? "Loading your week…" : "Show my timeline"}
                <span aria-hidden="true">↗</span>
              </button>
            </div>
            <p className="tl-sr-only">
              Use arrow keys to move between days. Press Enter on your first day
              and last day, or hold Shift with the arrow keys. Then confirm your
              selection.
            </p>
          </>
        )}
        {(phase === "collapse" || phase === "expand") && (
          <p className="tl-instruction" role="status">
            {requesting
              ? "Finding a few good things…"
              : "Making room for your plans…"}
          </p>
        )}
        {populated && (
          <div
            className={`tl-followups ${phase === "ready" ? "visible" : ""}`}
            inert={phase !== "ready"}
          >
            <button className="tl-change" onClick={changeDates}>
              Change dates
            </button>
            <button className="tl-discover" onClick={onDiscover}>
              Discover more <span aria-hidden="true">↗</span>
            </button>
            <span className="tl-hint">
              The whole campus is still out there.
            </span>
          </div>
        )}
        {!!error && (
          <div className="tl-error" role="alert">
            <p>{error}</p>
            <button onClick={changeDates}>Reload dates</button>
            <button onClick={onDiscover}>Discover more ↗</button>
          </div>
        )}
        <span className="tl-sr-only" aria-live="polite">
          {phase === "ready"
            ? `${view?.items.length || 0} events loaded for ${selectionLabel}.`
            : ""}
        </span>
      </div>
      <p className="tl-campus-note">
        VIRGINIA TECH <span>·</span> YOUR CAMPUS, AT YOUR PACE
      </p>
    </section>
  );
}
