/* eslint-disable no-unused-vars */
import { useState, useEffect, useCallback, useMemo } from "react";

// ── Utility helpers ────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().slice(0, 10);
const formatDate = (d) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
const formatFullDate = (d) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
const dayName = (d) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" });

function getLast(n) {
  const dates = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function computeStats(habits, logs) {
  const stats = {};
  habits.forEach((h) => {
    const entries = Object.entries(logs)
      .filter(([, v]) => v[h.id] !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));

    const done = entries.filter(([, v]) => {
      const val = v[h.id];
      return h.type === "binary" ? val === true : (typeof val === "number" && val > 0);
    });

    const total = entries.length;
    const rate = total ? Math.round((done.length / total) * 100) : 0;

    // streaks
    let current = 0, longest = 0, streak = 0;
    const allDates = getLast(90);
    allDates.forEach((date) => {
      const val = logs[date]?.[h.id];
      const isDone = h.type === "binary" ? val === true : (typeof val === "number" && val > 0);
      if (isDone) {
        streak++;
        if (streak > longest) longest = streak;
      } else if (val !== undefined) {
        streak = 0;
      }
    });
    // current streak from today backwards
    for (let i = 0; i < 90; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const date = d.toISOString().slice(0, 10);
      const val = logs[date]?.[h.id];
      const isDone = h.type === "binary" ? val === true : (typeof val === "number" && val > 0);
      if (isDone) current++;
      else break;
    }

    stats[h.id] = { rate, current, longest, done: done.length, total };
  });
  return stats;
}

function disciplineScore(habits, stats) {
  if (!habits.length) return 0;
  const totalWeight = habits.reduce((s, h) => s + (h.weight || 1), 0);
  let score = 0;
  habits.forEach((h) => {
    const s = stats[h.id] || {};
    const w = (h.weight || 1) / totalWeight;
    const streakBonus = Math.min(s.current * 0.5, 15);
    score += w * (s.rate + streakBonus);
  });
  return Math.min(100, Math.round(score));
}

function getLevel(score) {
  if (score >= 90) return { label: "Extremely Disciplined", color: "#00FFC2", icon: "⚡", tier: 4 };
  if (score >= 75) return { label: "Good", color: "#7EE8A2", icon: "🔥", tier: 3 };
  if (score >= 50) return { label: "Average (ACG)", color: "#F6C90E", icon: "📈", tier: 2 };
  return { label: "Low Discipline", color: "#FF6B6B", icon: "💤", tier: 1 };
}

// ── Sparkline (SVG) ─────────────────────────────────────────────────────────
function Sparkline({ data, color }) {
  if (!data.length) return null;
  const W = 120, H = 36, pad = 4;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = pad + (i / Math.max(data.length - 1, 1)) * (W - pad * 2);
    const y = H - pad - (v / max) * (H - pad * 2);
    return `${x},${y}`;
  });
  const fill = pts.map((p, i) => (i === 0 ? `M${p}` : `L${p}`)).join(" ");
  const area = `${fill} L${W - pad},${H - pad} L${pad},${H - pad} Z`;
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <defs>
        <linearGradient id={`sg-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${color})`} />
      <path d={fill} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── MiniCalendar / Heatmap ───────────────────────────────────────────────────
function Heatmap({ habits, logs }) {
  const days = getLast(365);
  const getScore = (date) => {
    const dayLog = logs[date];
    if (!dayLog || !habits.length) return -1;
    let done = 0;
    habits.forEach((h) => {
      const val = dayLog[h.id];
      if (h.type === "binary" ? val === true : (typeof val === "number" && val > 0)) done++;
    });
    return done / habits.length;
  };
  const color = (score) => {
    if (score < 0) return "#1a1a2e";
    if (score === 0) return "#16213e";
    if (score < 0.4) return "#1a3a5c";
    if (score < 0.7) return "#0d7a5f";
    return "#00FFC2";
  };

  const weeks = [];
  let week = [];
  days.forEach((d, i) => {
    week.push(d);
    if (week.length === 7 || i === days.length - 1) {
      weeks.push(week);
      week = [];
    }
  });

  const monthLabels = weeks.map((w, wi) => {
    const firstDay = w[0];
    const isFirstWeek = wi === 0;
    const prevMonth = !isFirstWeek
      ? new Date(weeks[wi - 1][0] + "T00:00:00").getMonth()
      : null;
    const curr = new Date(firstDay + "T00:00:00");
    const currMonth = curr.getMonth();
    const shouldShow = isFirstWeek || currMonth !== prevMonth;
    return shouldShow ? curr.toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "";
  });

  const monthStarts = weeks.map((w, wi) => {
    if (wi === 0) return false;
    const prevMonth = new Date(weeks[wi - 1][0] + "T00:00:00").getMonth();
    const currMonth = new Date(w[0] + "T00:00:00").getMonth();
    return currMonth !== prevMonth;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowX: "auto" }}>
      <div style={{ display: "flex", gap: 4, minWidth: "max-content" }}>
        {monthLabels.map((label, i) => (
          <div
            key={`month-${weeks[i][0]}`}
            style={{
              width: 14,
              marginLeft: monthStarts[i] ? 10 : 0,
              fontSize: 10,
              color: "#666",
              transform: "translateY(2px)",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 4, flexWrap: "nowrap", minWidth: "max-content" }}>
        {weeks.map((w, wi) => (
          <div
            key={wi}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              marginLeft: monthStarts[wi] ? 10 : 0,
            }}
          >
            {w.map((d) => {
              const score = getScore(d);
              return (
                <div
                  key={d}
                  title={`${formatFullDate(d)}: ${score < 0 ? "No log" : Math.round(score * 100) + "%"}`}
                  style={{
                    width: 14, height: 14, borderRadius: 3,
                    background: color(score),
                    border: d === today() ? "1.5px solid #00FFC2" : "none",
                    cursor: "default",
                    transition: "transform 0.1s",
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Bar Chart ────────────────────────────────────────────────────────────────
function BarChart({ habits, stats }) {
  if (!habits.length) return <div style={{ color: "#555", fontSize: 13 }}>No habits yet.</div>;
  const max = 100;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {habits.map((h) => {
        const s = stats[h.id] || {};
        const pct = s.rate || 0;
        const lv = getLevel(pct);
        return (
          <div key={h.id}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: "#ccc", fontFamily: "'Courier New',monospace" }}>{h.name}</span>
              <span style={{ fontSize: 13, color: lv.color, fontWeight: 700 }}>{pct}%</span>
            </div>
            <div style={{ height: 8, background: "#1a1a2e", borderRadius: 4, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%", width: `${pct}%`,
                  background: `linear-gradient(90deg, ${lv.color}88, ${lv.color})`,
                  borderRadius: 4,
                  transition: "width 0.6s cubic-bezier(.4,0,.2,1)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Line Chart (SVG) ─────────────────────────────────────────────────────────
function LineChart({ habits, logs }) {
  const dates = getLast(14);
  const W = 420, H = 160, padL = 36, padB = 28, padT = 12, padR = 12;
  const iW = W - padL - padR, iH = H - padB - padT;

  const series = habits.slice(0, 5).map((h, idx) => {
    const palette = ["#00FFC2", "#7EE8A2", "#F6C90E", "#FF6B6B", "#A78BFA"];
    const pts = dates.map((d) => {
      const val = logs[d]?.[h.id];
      return h.type === "binary" ? (val === true ? 100 : val === false ? 0 : null) : (typeof val === "number" ? Math.min(val * 10, 100) : null);
    });
    return { name: h.name, pts, color: palette[idx % palette.length] };
  });

  const xPos = (i) => padL + (i / Math.max(dates.length - 1, 1)) * iW;
  const yPos = (v) => H - padB - (v / 100) * iH;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
      {/* grid */}
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line x1={padL} y1={yPos(v)} x2={W - padR} y2={yPos(v)} stroke="#1e2040" strokeWidth="1" />
          <text x={padL - 6} y={yPos(v) + 4} textAnchor="end" fontSize="9" fill="#444">{v}</text>
        </g>
      ))}
      {/* x labels */}
      {dates.filter((_, i) => i % 2 === 0).map((d, i) => (
        <text key={d} x={xPos(i * 2)} y={H - 4} textAnchor="middle" fontSize="9" fill="#555">
          {dayName(d)}
        </text>
      ))}
      {/* lines */}
      {series.map((s) => {
        const valid = s.pts.map((v, i) => v !== null ? { x: xPos(i), y: yPos(v) } : null);
        let path = "";
        valid.forEach((pt, i) => {
          if (!pt) return;
          const prev = valid.slice(0, i).reverse().find(Boolean);
          path += prev ? ` L${pt.x},${pt.y}` : ` M${pt.x},${pt.y}`;
        });
        return (
          <g key={s.name}>
            <path d={path} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {valid.map((pt, i) => pt && (
              <circle key={i} cx={pt.x} cy={pt.y} r="3" fill={s.color} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

// ── ScoreMeter ───────────────────────────────────────────────────────────────
function ScoreMeter({ score }) {
  const lv = getLevel(score);
  const r = 52, cx = 70, cy = 70;
  const circumference = 2 * Math.PI * r;
  const arc = circumference * 0.75;
  const dashOffset = arc - (score / 100) * arc;
  const startAngle = 135, endAngle = startAngle + 270 * (score / 100);
  const toRad = (a) => (a * Math.PI) / 180;
  const needleX = cx + r * Math.cos(toRad(endAngle - 90));
  const needleY = cy + r * Math.sin(toRad(endAngle - 90));

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={140} height={120} viewBox="0 0 140 120">
        <defs>
          <linearGradient id="meterGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FF6B6B" />
            <stop offset="50%" stopColor="#F6C90E" />
            <stop offset="100%" stopColor="#00FFC2" />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1a1a2e" strokeWidth="10"
          strokeDasharray={`${arc} ${circumference}`}
          strokeDashoffset={-circumference * 0.125}
          strokeLinecap="round"
          transform={`rotate(0 ${cx} ${cy})`}
          style={{ transformOrigin: `${cx}px ${cy}px`, transform: "rotate(-0.5deg)" }}
        />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="url(#meterGrad)" strokeWidth="10"
          strokeDasharray={`${arc * score / 100} ${circumference}`}
          strokeDashoffset={-circumference * 0.125 + (arc - arc * score / 100)}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1s ease" }}
        />
        <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke={lv.color} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="5" fill={lv.color} />
        <text x={cx} y={cy + 22} textAnchor="middle" fontSize="22" fontWeight="900" fill="#fff" fontFamily="'Courier New',monospace">{score}</text>
        <text x={cx} y={cy + 34} textAnchor="middle" fontSize="9" fill="#666">/ 100</text>
      </svg>
      <div style={{
        fontSize: 12, fontWeight: 700, color: lv.color,
        letterSpacing: "0.1em", textTransform: "uppercase", marginTop: -8,
        fontFamily: "'Courier New',monospace",
      }}>
        {lv.icon} {lv.label}
      </div>
    </div>
  );
}

// ── HabitCard ────────────────────────────────────────────────────────────────
function HabitCard({ habit, stats, logs, onLog }) {
  const s = stats[habit.id] || {};
  const lv = getLevel(s.rate || 0);
  const todayVal = logs[today()]?.[habit.id];
  const last7 = getLast(7).map((d) => {
    const val = logs[d]?.[habit.id];
    return habit.type === "binary" ? (val === true ? 1 : 0) : (typeof val === "number" ? val : 0);
  });

  return (
    <div style={{
      background: "linear-gradient(135deg, #0d1117 0%, #161b22 100%)",
      border: `1px solid ${lv.color}22`,
      borderRadius: 12, padding: "16px 20px",
      position: "relative", overflow: "hidden",
      transition: "border-color 0.2s",
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${lv.color}, transparent)` }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#f0f6fc", fontFamily: "'Courier New',monospace", letterSpacing: "-0.02em" }}>{habit.name}</div>
          <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
            {habit.type === "binary" ? "✓ Binary" : "# Numeric"} · Weight {habit.weight || 1}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: lv.color, fontFamily: "'Courier New',monospace" }}>{s.rate || 0}%</div>
          <div style={{ fontSize: 10, color: "#555" }}>consistency</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
        <div style={{ flex: 1, background: "#0a0e1a", borderRadius: 8, padding: "8px 12px" }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#00FFC2", fontFamily: "'Courier New',monospace" }}>🔥 {s.current || 0}</div>
          <div style={{ fontSize: 10, color: "#555" }}>current streak</div>
        </div>
        <div style={{ flex: 1, background: "#0a0e1a", borderRadius: 8, padding: "8px 12px" }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: "#F6C90E", fontFamily: "'Courier New',monospace" }}>⚡ {s.longest || 0}</div>
          <div style={{ fontSize: 10, color: "#555" }}>longest streak</div>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}>
          <Sparkline data={last7} color={lv.color} />
        </div>
      </div>

      {/* Today's log */}
      <div style={{ borderTop: "1px solid #1e2040", paddingTop: 12 }}>
        {habit.type === "binary" ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => onLog(habit.id, true)}
              style={{
                flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer",
                background: todayVal === true ? "#00FFC2" : "#0d1117",
                color: todayVal === true ? "#000" : "#00FFC2",
                // eslint-disable-next-line no-dupe-keys
                border: `1px solid #00FFC222`,
                fontWeight: 700, fontSize: 13, fontFamily: "'Courier New',monospace",
                transition: "all 0.15s",
              }}
            >✓ Done</button>
            <button
              onClick={() => onLog(habit.id, false)}
              style={{
                flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer",
                background: todayVal === false ? "#FF6B6B" : "#0d1117",
                color: todayVal === false ? "#000" : "#FF6B6B",
                // eslint-disable-next-line no-dupe-keys
                border: `1px solid #FF6B6B22`,
                fontWeight: 700, fontSize: 13, fontFamily: "'Courier New',monospace",
                transition: "all 0.15s",
              }}
            >✗ Skip</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="number" min="0" step="0.5"
              value={typeof todayVal === "number" ? todayVal : ""}
              onChange={(e) => onLog(habit.id, parseFloat(e.target.value) || 0)}
              placeholder="Enter value..."
              style={{
                flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid #1e2040",
                background: "#0a0e1a", color: "#f0f6fc", fontSize: 13,
                fontFamily: "'Courier New',monospace", outline: "none",
              }}
            />
            <span style={{ color: "#555", fontSize: 12 }}>{typeof todayVal === "number" ? `✓ ${todayVal}` : "—"}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Add Habit Modal ──────────────────────────────────────────────────────────
function AddHabitModal({ onAdd, onClose }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("binary");
  const [weight, setWeight] = useState(1);

  const submit = () => {
    if (!name.trim()) return;
    onAdd({ id: Date.now().toString(), name: name.trim(), type, weight: Number(weight) });
    onClose();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 1000,
      backdropFilter: "blur(4px)",
    }}>
      <div style={{
        background: "#0d1117", border: "1px solid #00FFC233", borderRadius: 16,
        padding: "24px clamp(16px, 4vw, 32px)",
        width: "min(92vw, 360px)",
        boxShadow: "0 0 60px #00FFC211",
      }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#f0f6fc", marginBottom: 24, fontFamily: "'Courier New',monospace" }}>
          + New Habit
        </div>

        {[
          { label: "Habit Name", el: <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Gym, Reading..." style={inputStyle} onKeyDown={(e) => e.key === "Enter" && submit()} autoFocus /> },
          {
            label: "Type", el: (
              <div style={{ display: "flex", gap: 8 }}>
                {["binary", "numeric"].map((t) => (
                  <button key={t} onClick={() => setType(t)} style={{
                    flex: 1, padding: "10px 0", borderRadius: 8, border: "none", cursor: "pointer",
                    background: type === t ? "#00FFC2" : "#1a1a2e",
                    color: type === t ? "#000" : "#888",
                    fontWeight: 700, fontSize: 13, fontFamily: "'Courier New',monospace",
                    transition: "all 0.15s",
                  }}>
                    {t === "binary" ? "✓ Done/Skip" : "# Count/Hours"}
                  </button>
                ))}
              </div>
            )
          },
          {
            label: `Weight (importance): ${weight}`, el: (
              <input type="range" min="1" max="5" value={weight} onChange={(e) => setWeight(e.target.value)}
                style={{ width: "100%", accentColor: "#00FFC2" }} />
            )
          },
        ].map(({ label, el }) => (
          <div key={label} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: "#555", marginBottom: 8, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "'Courier New',monospace" }}>{label}</div>
            {el}
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "12px 0", borderRadius: 8, border: "1px solid #1e2040", background: "transparent", color: "#666", cursor: "pointer", fontFamily: "'Courier New',monospace" }}>Cancel</button>
          <button onClick={submit} style={{ flex: 2, padding: "12px 0", borderRadius: 8, border: "none", background: "#00FFC2", color: "#000", fontWeight: 900, cursor: "pointer", fontSize: 14, fontFamily: "'Courier New',monospace", letterSpacing: "0.05em" }}>Add Habit →</button>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #1e2040",
  background: "#0a0e1a", color: "#f0f6fc", fontSize: 14, fontFamily: "'Courier New',monospace",
  outline: "none", boxSizing: "border-box",
};

// ── WeeklySummary ────────────────────────────────────────────────────────────
function WeeklySummary({ habits, logs }) {
  const last7 = getLast(7);
  const rows = habits.map((h) => {
    let done = 0;
    last7.forEach((d) => {
      const val = logs[d]?.[h.id];
      if (h.type === "binary" ? val === true : (typeof val === "number" && val > 0)) done++;
    });
    return { name: h.name, done, total: 7 };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.length === 0 && <div style={{ color: "#555", fontSize: 13 }}>No habits tracked yet.</div>}
      {rows.map((r) => (
        <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 90, flex: "1 1 120px", fontSize: 12, color: "#aaa", fontFamily: "'Courier New',monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
          <div style={{ flex: 1, display: "flex", gap: 3 }}>
            {last7.map((d, i) => {
              const val = logs[d]?.[habits.find((h) => h.name === r.name)?.id];
              const h = habits.find((x) => x.name === r.name);
              const isDone = h ? (h.type === "binary" ? val === true : (typeof val === "number" && val > 0)) : false;
              const logged = val !== undefined;
              return (
                <div key={i} title={formatDate(d)} style={{
                  width: 20, height: 20, borderRadius: 4,
                  background: isDone ? "#00FFC2" : logged ? "#FF6B6B33" : "#1a1a2e",
                  border: isDone ? "none" : "1px solid #1e2040",
                }} />
              );
            })}
          </div>
          <div style={{ fontSize: 12, color: "#00FFC2", fontFamily: "'Courier New',monospace", minWidth: 44, textAlign: "right" }}>{r.done}/7</div>
        </div>
      ))}
    </div>
  );
}

// ── Export ───────────────────────────────────────────────────────────────────
function exportCSV(habits, logs) {
  const dates = Object.keys(logs).sort();
  const header = ["Date", ...habits.map((h) => h.name)].join(",");
  const rows = dates.map((d) => [d, ...habits.map((h) => logs[d]?.[h.id] ?? "")].join(","));
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "discipline-tracker.csv";
  a.click();
}

// ── Nav ──────────────────────────────────────────────────────────────────────
const NAV = ["Today", "Analytics", "Calendar", "Habits"];

// ── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [habits, setHabits] = useState(() => {
    try { return JSON.parse(localStorage.getItem("dt-habits") || "[]"); } catch { return []; }
  });
  const [logs, setLogs] = useState(() => {
    try { return JSON.parse(localStorage.getItem("dt-logs") || "{}"); } catch { return {}; }
  });
  const [tab, setTab] = useState("Today");
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => { localStorage.setItem("dt-habits", JSON.stringify(habits)); }, [habits]);
  useEffect(() => { localStorage.setItem("dt-logs", JSON.stringify(logs)); }, [logs]);

  const stats = useMemo(() => computeStats(habits, logs), [habits, logs]);
  const score = useMemo(() => disciplineScore(habits, stats), [habits, stats]);
  const level = getLevel(score);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2000); };

  const logHabit = useCallback((habitId, value) => {
    setLogs((prev) => ({
      ...prev,
      [today()]: { ...(prev[today()] || {}), [habitId]: value },
    }));
  }, []);

  const addHabit = (h) => {
    setHabits((prev) => [...prev, h]);
    showToast(`"${h.name}" added!`);
  };

  const removeHabit = (id) => {
    setHabits((prev) => prev.filter((h) => h.id !== id));
    showToast("Habit removed.");
  };

  const todayLogged = habits.filter((h) => logs[today()]?.[h.id] !== undefined).length;
  const todayPct = habits.length ? Math.round((todayLogged / habits.length) * 100) : 0;

  return (
    <div style={{
      minHeight: "100vh", background: "#060910",
      fontFamily: "'Courier New', monospace",
      color: "#f0f6fc",
    }}>
      {/* GLOBAL STYLES */}
      <style>{`
        * { box-sizing: border-box; }
        html, body, #root { width: 100%; min-height: 100%; }
        body { overflow-x: hidden; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #060910; }
        ::-webkit-scrollbar-thumb { background: #1e2040; border-radius: 2px; }
        input:focus { border-color: #00FFC255 !important; }
        @keyframes slideIn { from { opacity:0; transform:translateY(20px);} to { opacity:1; transform:translateY(0);} }
        @keyframes fadeIn { from {opacity:0} to {opacity:1} }
        @keyframes pulse { 0%,100% {opacity:1} 50%{opacity:.5} }
        .habit-card { animation: slideIn 0.4s ease both; }
        .tab-btn:hover { background: #1a1a2e !important; color: #f0f6fc !important; }
        .nav-btn:hover { color: #00FFC2 !important; }

        .app-header { gap: 12px; flex-wrap: wrap; }
        .analytics-grid { grid-template-columns: 1fr; }
        .manage-header { gap: 12px; flex-wrap: wrap; }
        .habit-manage-card { flex-wrap: wrap; }
        .score-breakdown-grid { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
        .chart-scroll { overflow-x: auto; }
        .chart-scroll-inner { min-width: 420px; }

        @media (max-width: 900px) {
          .header-brand,
          .header-tabs,
          .header-actions {
            width: 100%;
          }
          .header-tabs,
          .header-actions {
            overflow-x: auto;
            padding-bottom: 2px;
          }
          .header-actions {
            justify-content: flex-start;
          }
          .today-top {
            padding: 16px;
          }
        }

        @media (min-width: 901px) {
          .analytics-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
      `}</style>

      {/* TOAST */}
      {toast && (
        <div style={{
          position: "fixed", top: 24, right: 24, background: "#00FFC2", color: "#000",
          padding: "10px 20px", borderRadius: 8, fontWeight: 700, fontSize: 13,
          zIndex: 9999, animation: "slideIn 0.3s ease",
        }}>{toast}</div>
      )}

      {/* HEADER */}
      <div className="app-header" style={{
        borderBottom: "1px solid #0d1117",
        padding: "12px clamp(12px, 3vw, 24px)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "#060910",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div className="header-brand" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: "linear-gradient(135deg, #00FFC2, #00a8ff)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18,
          }}>⚡</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.04em", color: "#f0f6fc" }}>DISCIPLINE</div>
            <div style={{ fontSize: 10, color: "#444", letterSpacing: "0.2em", marginTop: -2 }}>TRACKER</div>
          </div>
        </div>

        <div className="header-tabs" style={{ display: "flex", gap: 4 }}>
          {NAV.map((n) => (
            <button key={n} className="tab-btn" onClick={() => setTab(n)} style={{
              padding: "7px 16px", borderRadius: 8, border: "none", cursor: "pointer",
              background: tab === n ? "#00FFC2" : "transparent",
              color: tab === n ? "#000" : "#555",
              fontWeight: tab === n ? 900 : 400, fontSize: 12,
              fontFamily: "'Courier New',monospace",
              letterSpacing: "0.05em", transition: "all 0.15s",
            }}>{n}</button>
          ))}
        </div>

        <div className="header-actions" style={{ display: "flex", gap: 8 }}>
          <button onClick={() => exportCSV(habits, logs)} style={{
            padding: "8px 14px", borderRadius: 8, border: "1px solid #1e2040",
            background: "transparent", color: "#555", cursor: "pointer", fontSize: 11,
            fontFamily: "'Courier New',monospace",
          }}>↓ CSV</button>
          <button onClick={() => setShowAdd(true)} style={{
            padding: "8px 16px", borderRadius: 8, border: "none",
            background: "#00FFC2", color: "#000", cursor: "pointer", fontSize: 12,
            fontWeight: 900, fontFamily: "'Courier New',monospace",
          }}>+ Add</button>
        </div>
      </div>

      {/* BODY */}
      <div style={{ width: "100%", margin: 0, padding: "clamp(12px, 2.5vw, 24px) clamp(12px, 3vw, 24px)" }}>

        {/* ── TODAY ── */}
        {tab === "Today" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            {/* Status bar */}
            <div className="today-top" style={{
              background: "linear-gradient(135deg, #0d1117, #161b22)",
              border: "1px solid #1e2040", borderRadius: 16, padding: "20px 24px",
              marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between",
              flexWrap: "wrap", gap: 16,
            }}>
              <div>
                <div style={{ fontSize: 12, color: "#555", marginBottom: 4, letterSpacing: "0.1em" }}>
                  {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.04em" }}>
                  Today's Progress
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                  <div style={{ height: 6, width: "min(240px, 56vw)", background: "#1a1a2e", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${todayPct}%`, background: "#00FFC2", borderRadius: 3, transition: "width 0.5s ease" }} />
                  </div>
                  <span style={{ fontSize: 13, color: "#00FFC2", fontWeight: 700 }}>{todayLogged}/{habits.length} logged</span>
                </div>
              </div>
              <ScoreMeter score={score} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 150 }}>
                <div style={{ background: "#0a0e1a", borderRadius: 10, padding: "12px 16px" }}>
                  <div style={{ fontSize: 11, color: "#555", marginBottom: 2 }}>DISCIPLINE SCORE</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: level.color }}>{score}</div>
                </div>
                <div style={{ background: "#0a0e1a", borderRadius: 10, padding: "10px 16px", border: `1px solid ${level.color}22` }}>
                  <div style={{ fontSize: 11, color: level.color, fontWeight: 700 }}>{level.icon} {level.label}</div>
                </div>
              </div>
            </div>

            {habits.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#333" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🎯</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#444", marginBottom: 8 }}>No habits yet</div>
                <div style={{ fontSize: 13, marginBottom: 24 }}>Add your first habit to start tracking your discipline.</div>
                <button onClick={() => setShowAdd(true)} style={{
                  padding: "12px 28px", borderRadius: 10, border: "none",
                  background: "#00FFC2", color: "#000", fontWeight: 900, fontSize: 14,
                  cursor: "pointer", fontFamily: "'Courier New',monospace",
                }}>+ Add First Habit</button>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: 16 }}>
              {habits.map((h, i) => (
                <div key={h.id} className="habit-card" style={{ animationDelay: `${i * 0.05}s` }}>
                  <HabitCard habit={h} stats={stats} logs={logs} onLog={logHabit} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ANALYTICS ── */}
        {tab === "Analytics" && (
          <div style={{ animation: "fadeIn 0.3s ease", display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="analytics-grid" style={{ display: "grid", gap: 20 }}>
              <div style={{ background: "#0d1117", border: "1px solid #1e2040", borderRadius: 16, padding: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 16, letterSpacing: "0.1em" }}>📈 PROGRESS OVER 14 DAYS</div>
                <div className="chart-scroll">
                  <div className="chart-scroll-inner">
                    <LineChart habits={habits} logs={logs} />
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
                  {habits.slice(0, 5).map((h, i) => {
                    const palette = ["#00FFC2", "#7EE8A2", "#F6C90E", "#FF6B6B", "#A78BFA"];
                    return (
                      <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: palette[i % 5] }} />
                        <span style={{ fontSize: 11, color: "#888" }}>{h.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ background: "#0d1117", border: "1px solid #1e2040", borderRadius: 16, padding: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 16, letterSpacing: "0.1em" }}>📊 HABIT PERFORMANCE</div>
                <BarChart habits={habits} stats={stats} />
              </div>
            </div>

            <div style={{ background: "#0d1117", border: "1px solid #1e2040", borderRadius: 16, padding: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 16, letterSpacing: "0.1em" }}>📅 WEEKLY SUMMARY (LAST 7 DAYS)</div>
              <WeeklySummary habits={habits} logs={logs} />
            </div>

            {/* Leaderboard */}
            <div style={{ background: "#0d1117", border: "1px solid #1e2040", borderRadius: 16, padding: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 16, letterSpacing: "0.1em" }}>🏆 HABIT LEADERBOARD</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
                {[...habits].sort((a, b) => (stats[b.id]?.rate || 0) - (stats[a.id]?.rate || 0)).map((h, i) => {
                  const s = stats[h.id] || {};
                  const medals = ["🥇", "🥈", "🥉"];
                  return (
                    <div key={h.id} style={{ background: "#0a0e1a", borderRadius: 10, padding: "14px 16px", border: "1px solid #1e2040" }}>
                      <div style={{ fontSize: 18, marginBottom: 4 }}>{medals[i] || `#${i + 1}`}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#f0f6fc", marginBottom: 2 }}>{h.name}</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: "#00FFC2" }}>{s.rate || 0}%</div>
                      <div style={{ fontSize: 11, color: "#555" }}>🔥 {s.current || 0} day streak</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── CALENDAR ── */}
        {tab === "Calendar" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div style={{ background: "#0d1117", border: "1px solid #1e2040", borderRadius: 16, padding: 28, marginBottom: 20 }}>
              {(() => {
                const range = getLast(365);
                const start = range[0];
                const end = range[range.length - 1];
                return (
                  <div style={{ fontSize: 11, color: "#666", marginBottom: 10 }}>
                    {formatFullDate(start)} - {formatFullDate(end)}
                  </div>
                );
              })()}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>Contribution Calendar</div>
                  <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>Full-year view with month/year labels and full date tooltips</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 11, color: "#555" }}>Less</span>
                  {["#1a1a2e", "#16213e", "#1a3a5c", "#0d7a5f", "#00FFC2"].map((c) => (
                    <div key={c} style={{ width: 12, height: 12, borderRadius: 2, background: c }} />
                  ))}
                  <span style={{ fontSize: 11, color: "#555" }}>More</span>
                </div>
              </div>
              <Heatmap habits={habits} logs={logs} />
            </div>

            {/* Per-habit calendars */}
            {habits.map((h) => {
              const last30 = getLast(30);
              return (
                <div key={h.id} style={{ background: "#0d1117", border: "1px solid #1e2040", borderRadius: 12, padding: "16px 20px", marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, color: "#f0f6fc" }}>{h.name}</div>
                    <div style={{ fontSize: 12, color: "#00FFC2" }}>{stats[h.id]?.rate || 0}% completion</div>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {last30.map((d) => {
                      const val = logs[d]?.[h.id];
                      const isDone = h.type === "binary" ? val === true : (typeof val === "number" && val > 0);
                      const logged = val !== undefined;
                      return (
                        <div key={d} title={`${formatDate(d)}: ${!logged ? "No log" : isDone ? "Done" : "Skipped"}`}
                          style={{
                            width: 18, height: 18, borderRadius: 3,
                            background: isDone ? "#00FFC2" : logged ? "#FF6B6B44" : "#1a1a2e",
                            border: d === today() ? "1.5px solid #00FFC2" : "none",
                          }} />
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {habits.length === 0 && (
              <div style={{ textAlign: "center", color: "#444", padding: 40 }}>No habits to display. Add some habits first!</div>
            )}
          </div>
        )}

        {/* ── HABITS ── */}
        {tab === "Habits" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div className="manage-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 900 }}>Manage Habits</div>
                <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>{habits.length} habits configured</div>
              </div>
              <button onClick={() => setShowAdd(true)} style={{
                padding: "10px 20px", borderRadius: 10, border: "none",
                background: "#00FFC2", color: "#000", fontWeight: 900,
                cursor: "pointer", fontFamily: "'Courier New',monospace",
              }}>+ New Habit</button>
            </div>

            {habits.length === 0 && (
              <div style={{ textAlign: "center", color: "#444", padding: 60 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
                <div>No habits yet. Create your first one!</div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {habits.map((h) => {
                const s = stats[h.id] || {};
                const lv = getLevel(s.rate || 0);
                return (
                  <div key={h.id} className="habit-manage-card" style={{
                    background: "#0d1117", border: "1px solid #1e2040", borderRadius: 14,
                    padding: "18px 24px", display: "flex", alignItems: "center", gap: 20,
                  }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 10, background: `${lv.color}15`,
                      border: `1px solid ${lv.color}33`, display: "flex", alignItems: "center",
                      justifyContent: "center", fontSize: 20, flexShrink: 0,
                    }}>
                      {h.type === "binary" ? "✓" : "#"}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 16, color: "#f0f6fc" }}>{h.name}</div>
                      <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                        {h.type === "binary" ? "Binary (done/skip)" : "Numeric (count/hours)"} · Weight: {h.weight} · Logged {s.total || 0} times
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 20, fontWeight: 900, color: lv.color }}>{s.rate || 0}%</div>
                        <div style={{ fontSize: 10, color: "#555" }}>consistency</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 20, fontWeight: 900, color: "#00FFC2" }}>🔥{s.current || 0}</div>
                        <div style={{ fontSize: 10, color: "#555" }}>streak</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 20, fontWeight: 900, color: "#F6C90E" }}>⚡{s.longest || 0}</div>
                        <div style={{ fontSize: 10, color: "#555" }}>best</div>
                      </div>
                    </div>
                    <button onClick={() => removeHabit(h.id)} style={{
                      background: "#FF6B6B11", border: "1px solid #FF6B6B22", color: "#FF6B6B",
                      borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 12,
                      fontFamily: "'Courier New',monospace", flexShrink: 0,
                    }}>Remove</button>
                  </div>
                );
              })}
            </div>

            {/* Score breakdown */}
            {habits.length > 0 && (
              <div style={{ marginTop: 24, background: "#0d1117", border: "1px solid #1e2040", borderRadius: 16, padding: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#555", marginBottom: 16, letterSpacing: "0.1em" }}>🧮 DISCIPLINE SCORE BREAKDOWN</div>
                <div className="score-breakdown-grid" style={{ display: "grid", gap: 12 }}>
                  {[
                    { label: "Score", value: score, color: level.color, suffix: "/100" },
                    { label: "Level", value: level.icon, color: level.color, suffix: "" },
                    { label: "Habits", value: habits.length, color: "#A78BFA", suffix: " total" },
                    { label: "Today", value: `${todayPct}%`, color: "#00FFC2", suffix: " done" },
                  ].map((item) => (
                    <div key={item.label} style={{ background: "#0a0e1a", borderRadius: 10, padding: "14px 16px", border: "1px solid #1e2040" }}>
                      <div style={{ fontSize: 11, color: "#555", marginBottom: 4, letterSpacing: "0.08em" }}>{item.label.toUpperCase()}</div>
                      <div style={{ fontSize: 24, fontWeight: 900, color: item.color }}>{item.value}<span style={{ fontSize: 12, color: "#555" }}>{item.suffix}</span></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showAdd && <AddHabitModal onAdd={addHabit} onClose={() => setShowAdd(false)} />}
    </div>
  );
}
