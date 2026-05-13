"use client";

import { useEffect, useState } from "react";

type Booking = {
  id: string;
  occupant_name: string;
  purpose: string | null;
  start_datetime: string;
  end_datetime: string;
  status: "active" | "cancelled";
  contact_info: string | null;
  cancellation_reason: string | null;
  room: { room_code: string; building: string; floor_number: number } | null;
};

export default function IFOBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // form state
  const [rooms, setRooms] = useState<Array<{ id: string; room_code: string; building: string; floor_number: number }>>([]);
  const [formRoom, setFormRoom] = useState("");
  const [formName, setFormName] = useState("");
  const [formPurpose, setFormPurpose] = useState("");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [formContact, setFormContact] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function refresh() {
    setLoading(true);
    const res = await fetch("/apis/bookings", { cache: "no-store" });
    const data = await res.json();
    setBookings(data?.bookings ?? []);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    fetch("/apis/rooms").then((r) => r.json()).then((d) => setRooms(d?.rooms ?? []));
  }, []);

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/apis/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id: formRoom,
          occupant_name: formName,
          purpose: formPurpose,
          start_datetime: new Date(formStart).toISOString(),
          end_datetime: new Date(formEnd).toISOString(),
          contact_info: formContact,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Failed to create booking");
      setShowForm(false);
      setFormRoom(""); setFormName(""); setFormPurpose(""); setFormStart(""); setFormEnd(""); setFormContact("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(bookingId: string) {
    const reason = prompt("Cancellation reason (min 3 characters):");
    if (!reason || reason.trim().length < 3) return;
    const res = await fetch(`/apis/bookings/${bookingId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d?.error?.message ?? "Cancel failed");
      return;
    }
    await refresh();
  }

  return (
    <div className="flex-1 flex flex-col fade-up">
            <div className="px-4 sm:px-6 lg:px-8 pb-6 lg:pb-8 space-y-4 lg:space-y-5">
        <header className="card-surface p-5 lg:p-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-headline text-[#001c43]">Manual Bookings</h1>
            <p className="text-[12.5px] text-slate-500 mt-0.5">Non-class room reservations (events, meetings, maintenance)</p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-bold text-white shadow-sm"
            style={{ background: "#7c3aed" }}
          >
            {showForm ? "Cancel" : "+ New Booking"}
          </button>
        </header>

      {showForm && (
        <form onSubmit={submitForm} className="bg-white border border-slate-200 rounded-lg p-5 mb-6 shadow-sm space-y-3">
          <h2 className="text-sm font-bold text-slate-900">New Booking</h2>
          {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Room">
              <select value={formRoom} onChange={(e) => setFormRoom(e.target.value)} required className={inputCls}>
                <option value="">Select room…</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.building} · Floor {r.floor_number} · Room {r.room_code}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Occupant Name">
              <input value={formName} onChange={(e) => setFormName(e.target.value)} required className={inputCls} placeholder="e.g. Department Meeting" />
            </Field>
            <Field label="Start">
              <input type="datetime-local" value={formStart} onChange={(e) => setFormStart(e.target.value)} required className={inputCls} />
            </Field>
            <Field label="End">
              <input type="datetime-local" value={formEnd} onChange={(e) => setFormEnd(e.target.value)} required className={inputCls} />
            </Field>
            <Field label="Purpose (optional)">
              <input value={formPurpose} onChange={(e) => setFormPurpose(e.target.value)} className={inputCls} placeholder="e.g. CCIS faculty meeting" />
            </Field>
            <Field label="Contact (optional)">
              <input value={formContact} onChange={(e) => setFormContact(e.target.value)} className={inputCls} placeholder="email or phone" />
            </Field>
          </div>
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#7c3aed,#6d28d9)" }}
            >
              {submitting ? "Saving…" : "Save Booking"}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
        <header className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">Active Bookings</h2>
          <span className="text-xs text-slate-400">{bookings.length} total</span>
        </header>
        {loading ? (
          <div className="p-6 space-y-3">
            <div className="h-12 skeleton" />
            <div className="h-12 skeleton" />
          </div>
        ) : bookings.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-400">No bookings yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {bookings.map((b) => (
              <li key={b.id} className="px-5 py-4 flex items-center gap-4">
                <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-purple-100 text-purple-800 shrink-0">
                  Booked
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{b.occupant_name}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {b.room && `${b.room.building} · Room ${b.room.room_code} · Floor ${b.room.floor_number}`} {b.purpose ? `· ${b.purpose}` : ""}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {new Date(b.start_datetime).toLocaleString()} → {new Date(b.end_datetime).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => cancel(b.id)}
                  className="text-xs font-semibold text-red-600 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50"
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      </div>
    </div>
  );
}

const inputCls = "w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-600 mb-1">{label}</span>
      {children}
    </label>
  );
}
