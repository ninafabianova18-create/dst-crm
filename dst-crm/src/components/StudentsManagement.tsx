import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query, updateDoc, doc } from "firebase/firestore";
import { db } from "../config/firebase";
import "../styles/StudentsManagement.css";

type MatchStatus = "matched" | "unmatched" | "ambiguous";

interface StudentData {
  id: string;

  // Known fields (for typing + autocomplete)
  name?: string;
  surname?: string;
  region?: string;
  school?: string;
  mail?: string;
  telephoneNumber?: string;
  typeOfPayment?: string;
  period?: string;
  amount?: number | string;
  iban?: string;
  note?: string;
  noteNeedsReview?: boolean;
  noteUpdatedAt?: Date | null;
  noteUpdatedBy?: string;
  vs?: string; // drž ako string

  createdAt?: Date | null;

  // If there are additional fields in the students collection, capture them here:
  [key: string]: any;
}

interface PaymentInfo {
  id: string;
  vs: string;
  amount: number | string;
  date: Date | null;
  message?: string;
  senderIban?: string;
  senderName?: string;
  matchStatus?: MatchStatus;
  matchedStudentId?: string | null;
}

const toDateSafe = (v: any): Date | null => {
  // Robust converter: handles Firestore Timestamp, Date, and string timestamp.
  if (!v) return null;
  if (v?.toDate) return v.toDate();
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

const toStringSafe = (v: any) => (v === undefined || v === null ? "" : String(v));

interface StudentsManagementProps {
  onRemindersChanged?: (count: number) => void;
}

export const StudentsManagement: React.FC<StudentsManagementProps> = ({ onRemindersChanged }) => {
  // Component combines two datasets (students + payments) into one admin view.
  const [students, setStudents] = useState<StudentData[]>([]);
  const [payments, setPayments] = useState<PaymentInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");

  // expanded sections
  const [expandedPayments, setExpandedPayments] = useState<Record<string, boolean>>({});
  const [expandedProfile, setExpandedProfile] = useState<Record<string, boolean>>({});

  // search
  const [search, setSearch] = useState("");
  const [noteReminderFilter, setNoteReminderFilter] = useState<"all" | "pending">("all");

  // edit mode + draft data
  const [editModeById, setEditModeById] = useState<Record<string, boolean>>({});
  const [draftById, setDraftById] = useState<Record<string, Partial<StudentData>>>({});
  const [savingById, setSavingById] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // One-shot initial load bez realtime listenerov.
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    setMessage("");
    try {
      // 1) Load students and normalize data types for consistent UI behavior.
      const studentsSnap = await getDocs(collection(db, "students"));
      const studentsList: StudentData[] = studentsSnap.docs.map((d) => {
        const data = d.data() as any;

        // Copy all fields (richer profile view)
        const student: StudentData = {
          id: d.id,
          ...data,
          // normalizations:
          vs: data.vs !== undefined && data.vs !== null ? String(data.vs) : "",
          createdAt: toDateSafe(data.createdAt),
          noteUpdatedAt: toDateSafe(data.noteUpdatedAt),
          noteNeedsReview: !!data.noteNeedsReview,
          noteUpdatedBy: data.noteUpdatedBy ?? "",
        };

        return student;
      });

      // 2) Load payments; these are used for fast VS-based linking.
      const paymentsQ = query(collection(db, "payments"), orderBy("date", "desc"));
      const paymentsSnap = await getDocs(paymentsQ);

      const paymentsList: PaymentInfo[] = paymentsSnap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          vs: data.vs !== undefined && data.vs !== null ? String(data.vs) : "",
          amount: data.amount ?? 0,
          date: toDateSafe(data.date),
          message: data.message ?? "",
          senderIban: data.senderIban ?? "",
          senderName: data.senderName ?? "",
          matchStatus: data.matchStatus ?? (data.matchedStudentId ? "matched" : "unmatched"),
          matchedStudentId: data.matchedStudentId ?? null,
        };
      });

      // Sort students (by surname, then name)
      studentsList.sort((a, b) => {
        const as = `${a.surname ?? ""} ${a.name ?? ""}`.toLowerCase();
        const bs = `${b.surname ?? ""} ${b.name ?? ""}`.toLowerCase();
        return as.localeCompare(bs);
      });

      setStudents(studentsList);
      setPayments(paymentsList);
      const remindersCount = studentsList.filter((s) => s.noteNeedsReview).length;
      onRemindersChanged?.(remindersCount);

      // Draft-cache pattern: local edit buffer separated from original DB data.
      setDraftById((prev) => {
        const next = { ...prev };
        for (const s of studentsList) {
          if (!next[s.id]) {
            next[s.id] = {
              name: s.name ?? "",
              surname: s.surname ?? "",
              region: s.region ?? "",
              school: s.school ?? "",
              mail: s.mail ?? "",
              telephoneNumber: s.telephoneNumber ?? "",
              typeOfPayment: s.typeOfPayment ?? "",
              period: s.period ?? "",
              amount: s.amount ?? "",
              iban: s.iban ?? "",
              note: s.note ?? "",
              vs: s.vs ?? "",
            };
          }
        }
        return next;
      });
    } catch (err) {
      console.error("Chyba pri načítaní študentov/platieb:", err);
      setMessage("Chyba pri načítaní študentov/platieb");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  };

  const assignPaymentToStudent = async (paymentId: string, studentId: string) => {
    try {
      // Directly updates payment document to explicitly assign it to a student.
      await updateDoc(doc(db, "payments", paymentId), {
        matchedStudentId: studentId,
        matchStatus: "matched",
      });
      loadAll();
    } catch (err) {
      console.error("Chyba pri párovaní:", err);
      setMessage("Chyba pri párovaní platby");
      setMessageType("error");
    }
  };

  // useMemo: precomputed VS-based payment index speeds up rendering of large tables.
  const paymentsByVS = useMemo(() => {
    const map = new Map<string, PaymentInfo[]>();
    for (const p of payments) {
      const key = (p.vs ?? "").trim();
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [payments]);

  const filteredStudents = useMemo(() => {
    // Full-text-ish client filter over a combined "blob" of key fields.
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (noteReminderFilter === "pending" && !s.noteNeedsReview) return false;
      if (!q) return true;

      const blob = `${s.name ?? ""} ${s.surname ?? ""} ${s.mail ?? ""} ${s.school ?? ""} ${s.vs ?? ""} ${s.telephoneNumber ?? ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [students, search, noteReminderFilter]);

  const togglePayments = (studentId: string) => {
    setExpandedPayments((prev) => ({ ...prev, [studentId]: !prev[studentId] }));
  };

  const toggleProfile = (studentId: string) => {
    setExpandedProfile((prev) => ({ ...prev, [studentId]: !prev[studentId] }));
  };

  const setDraftField = (studentId: string, key: keyof StudentData, value: any) => {
    setDraftById((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] ?? {}),
        [key]: value,
      },
    }));
  };

  const startEdit = (student: StudentData) => {
    setEditModeById((prev) => ({ ...prev, [student.id]: true }));
    setDraftById((prev) => ({
      ...prev,
      [student.id]: {
        name: student.name ?? "",
        surname: student.surname ?? "",
        region: student.region ?? "",
        school: student.school ?? "",
        mail: student.mail ?? "",
        telephoneNumber: student.telephoneNumber ?? "",
        typeOfPayment: student.typeOfPayment ?? "",
        period: student.period ?? "",
        amount: student.amount ?? "",
        iban: student.iban ?? "",
        note: student.note ?? "",
        vs: student.vs ?? "",
        // If you want to edit more custom fields from students collection,
        // add them here (or implement a dynamic editor).
      },
    }));
  };

  const cancelEdit = (student: StudentData) => {
    setEditModeById((prev) => ({ ...prev, [student.id]: false }));
    // Reset draft to current values
    startEdit(student);
    // startEdit would toggle editMode back on, so we set it manually:
    setEditModeById((prev) => ({ ...prev, [student.id]: false }));
  };

  const saveStudent = async (studentId: string) => {
    const draft = draftById[studentId] ?? {};
    setSavingById((prev) => ({ ...prev, [studentId]: true }));
    setMessage("");

    try {
      // Normalization-before-write: shape data for Firestore consistency and comparisons.
      const payload: any = {
        ...draft,
        vs: draft.vs !== undefined && draft.vs !== null ? String(draft.vs) : "",
      };

      // amount: convert to number when it is a numeric string
      if (payload.amount !== undefined && payload.amount !== null) {
        const n = typeof payload.amount === "number" ? payload.amount : Number(String(payload.amount).replace(",", "."));
        if (!isNaN(n)) payload.amount = n;
      }

      await updateDoc(doc(db, "students", studentId), payload);

      setMessage("Študent bol uložený.");
      setMessageType("success");

      setEditModeById((prev) => ({ ...prev, [studentId]: false }));
      await loadAll();
    } catch (err) {
      console.error("Chyba pri ukladaní študenta:", err);
      setMessage("Chyba pri ukladaní študenta");
      setMessageType("error");
    } finally {
      setSavingById((prev) => ({ ...prev, [studentId]: false }));
    }
  };

  const markStudentNoteAsReviewed = async (studentId: string) => {
    try {
      await updateDoc(doc(db, "students", studentId), {
        noteNeedsReview: false,
      });

      setMessage("Poznámka bola označená ako skontrolovaná.");
      setMessageType("success");
      await loadAll();
    } catch (err) {
      console.error("Chyba pri označení poznámky:", err);
      setMessage("Chyba pri označení poznámky");
      setMessageType("error");
    }
  };

  const markAllNotesAsReviewed = async () => {
    const pending = students.filter((s) => s.noteNeedsReview);
    if (pending.length === 0) return;

    try {
      await Promise.all(
        pending.map((s) =>
          updateDoc(doc(db, "students", s.id), {
            noteNeedsReview: false,
          })
        )
      );

      setMessage("Všetky nové poznámky sú označené ako skontrolované.");
      setMessageType("success");
      await loadAll();
    } catch (err) {
      console.error("Chyba pri hromadnom označení poznámok:", err);
      setMessage("Chyba pri hromadnom označení poznámok");
      setMessageType("error");
    }
  };

  const pendingNoteReminders = students.filter((s) => s.noteNeedsReview).length;

  if (loading) {
    return <div className="students-management-container">Načítavam študentov...</div>;
  }

  return (
    <div className="students-management-container">
      <div className="students-management-header">
        <h2>Správa študentov</h2>
        <p>Prehľad všetkých študentov, profil a platby</p>
      </div>

      {message && <div className={`message message-${messageType}`}>{message}</div>}

      {pendingNoteReminders > 0 && (
        <div className="note-reminder-banner">
          <span>
            Nové študentské poznámky na kontrolu: <b>{pendingNoteReminders}</b>
          </span>
          <button className="btn btn-warning" onClick={markAllNotesAsReviewed}>
            Označiť všetko ako skontrolované
          </button>
        </div>
      )}

      <div className="students-card">
        <div className="students-toolbar">
          <input
            className="students-search"
            placeholder="Hľadať (meno, priezvisko, mail, škola, VS)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="students-filter-buttons">
            <button
              className={`btn ${noteReminderFilter === "pending" ? "btn-warning" : ""}`}
              onClick={() => setNoteReminderFilter("pending")}
              type="button"
            >
              Nové správy
            </button>
            <button
              className={`btn ${noteReminderFilter === "all" ? "btn-filter-active" : ""}`}
              onClick={() => setNoteReminderFilter("all")}
              type="button"
            >
              Zobraziť všetkých
            </button>
          </div>

          <select
            className="students-filter"
            value={noteReminderFilter}
            onChange={(e) => setNoteReminderFilter(e.target.value as "all" | "pending")}
            title="Filter poznámok"
          >
            <option value="all">Všetci študenti</option>
            <option value="pending">Len nové poznámky</option>
          </select>

          <span className="students-count">
            Zobrazené: <b>{filteredStudents.length}</b> / {students.length}
          </span>
        </div>

        {filteredStudents.length === 0 ? (
          <p className="empty-message">Žiadni študenti pre dané hľadanie</p>
        ) : (
          <div className="students-table-wrapper">
            <table className="students-table">
              <thead>
                <tr>
                  <th>Meno</th>
                  <th>Mail</th>
                  <th>Škola</th>
                  <th>Región</th>
                  <th>Poznámka</th>
                  <th>VS</th>
                  <th>Platby</th>
                  <th>Akcia</th>
                </tr>
              </thead>

              <tbody>
                {filteredStudents.map((s) => {
                  const vsKey = (s.vs ?? "").trim();
                  const studentPayments = vsKey ? paymentsByVS.get(vsKey) ?? [] : [];

                  const isPaymentsOpen = !!expandedPayments[s.id];
                  const isProfileOpen = !!expandedProfile[s.id];
                  const isEditing = !!editModeById[s.id];
                  const draft = draftById[s.id] ?? {};
                  const isSaving = !!savingById[s.id];

                  return (
                    <React.Fragment key={s.id}>
                      {/* STUDENT ROW */}
                      <tr>
                        <td className="name-cell">
                          <div className="name-strong">{`${s.name ?? ""} ${s.surname ?? ""}`.trim() || "-"}</div>
                          <div className="name-sub">{s.telephoneNumber ?? ""}</div>
                        </td>
                        <td>{s.mail || "-"}</td>
                        <td>{s.school || "-"}</td>
                        <td>{s.region || "-"}</td>
                        <td className="note-cell">{s.note || "-"}</td>
                        <td className="vs-cell">{s.vs || "-"}</td>
                        <td>
                          <span className="payments-pill">{studentPayments.length}</span>
                        </td>
                        <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {s.noteNeedsReview && (
                            <button
                              className="btn btn-warning"
                              onClick={() => markStudentNoteAsReviewed(s.id)}
                              title="Študent upravil poznámku"
                            >
                              Nová poznámka
                            </button>
                          )}

                          <button className="btn" onClick={() => toggleProfile(s.id)}>
                            {isProfileOpen ? "Skryť profil" : "Profil"}
                          </button>

                          <button
                            className="btn"
                            onClick={() => togglePayments(s.id)}
                            disabled={!s.vs}
                            title={!s.vs ? "Študent nemá VS" : ""}
                          >
                            {isPaymentsOpen ? "Skryť platby" : "Platby"}
                          </button>
                        </td>
                      </tr>

                      {/* PROFIL (DETAIL + EDIT) */}
                      {isProfileOpen && (
                        <tr className="payments-row">
                          <td colSpan={8}>
                            <div className="payments-inner" style={{ paddingTop: 10 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                                <div>
                                  <b>Profil študenta</b>
                                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                                    ID: {s.id} {s.createdAt ? `• Vytvorený: ${s.createdAt.toLocaleString("sk-SK")}` : ""}
                                    {s.noteNeedsReview
                                      ? ` • Poznámka upravená${s.noteUpdatedAt ? `: ${s.noteUpdatedAt.toLocaleString("sk-SK")}` : ""}`
                                      : ""}
                                  </div>
                                </div>

                                <div style={{ display: "flex", gap: 8 }}>
                                  {!isEditing ? (
                                    <button className="btn" onClick={() => startEdit(s)}>
                                      Upraviť
                                    </button>
                                  ) : (
                                    <>
                                      <button className="btn" onClick={() => saveStudent(s.id)} disabled={isSaving}>
                                        {isSaving ? "Ukladám..." : "Uložiť"}
                                      </button>
                                      <button className="btn" onClick={() => cancelEdit(s)} disabled={isSaving}>
                                        Zrušiť
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* FORM / VIEW */}
                              <div
                                style={{
                                  marginTop: 12,
                                  display: "grid",
                                  gridTemplateColumns: "repeat(3, minmax(220px, 1fr))",
                                  gap: 12,
                                }}
                              >
                                {/* MENO */}
                                <div>
                                  <div style={{ fontSize: 12, opacity: 0.8 }}>Meno</div>
                                  {isEditing ? (
                                    <input
                                      className="students-search"
                                      value={toStringSafe(draft.name)}
                                      onChange={(e) => setDraftField(s.id, "name", e.target.value)}
                                    />
                                  ) : (
                                    <div>{s.name || "-"}</div>
                                  )}
                                </div>

                                {/* PRIEZVISKO */}
                                <div>
                                  <div style={{ fontSize: 12, opacity: 0.8 }}>Priezvisko</div>
                                  {isEditing ? (
                                    <input
                                      className="students-search"
                                      value={toStringSafe(draft.surname)}
                                      onChange={(e) => setDraftField(s.id, "surname", e.target.value)}
                                    />
                                  ) : (
                                    <div>{s.surname || "-"}</div>
                                  )}
                                </div>

                                {/* PHONE */}
                                <div>
                                  <div style={{ fontSize: 12, opacity: 0.8 }}>Telefón</div>
                                  {isEditing ? (
                                    <input
                                      className="students-search"
                                      value={toStringSafe(draft.telephoneNumber)}
                                      onChange={(e) => setDraftField(s.id, "telephoneNumber", e.target.value)}
                                    />
                                  ) : (
                                    <div>{s.telephoneNumber || "-"}</div>
                                  )}
                                </div>

                                {/* MAIL */}
                                <div>
                                  <div style={{ fontSize: 12, opacity: 0.8 }}>Mail</div>
                                  {isEditing ? (
                                    <input
                                      className="students-search"
                                      value={toStringSafe(draft.mail)}
                                      onChange={(e) => setDraftField(s.id, "mail", e.target.value)}
                                    />
                                  ) : (
                                    <div>{s.mail || "-"}</div>
                                  )}
                                </div>

                                {/* SCHOOL */}
                                <div>
                                  <div style={{ fontSize: 12, opacity: 0.8 }}>Škola</div>
                                  {isEditing ? (
                                    <input
                                      className="students-search"
                                      value={toStringSafe(draft.school)}
                                      onChange={(e) => setDraftField(s.id, "school", e.target.value)}
                                    />
                                  ) : (
                                    <div>{s.school || "-"}</div>
                                  )}
                                </div>

                                {/* REGION */}
                                <div>
                                  <div style={{ fontSize: 12, opacity: 0.8 }}>Región</div>
                                  {isEditing ? (
                                    <input
                                      className="students-search"
                                      value={toStringSafe(draft.region)}
                                      onChange={(e) => setDraftField(s.id, "region", e.target.value)}
                                    />
                                  ) : (
                                    <div>{s.region || "-"}</div>
                                  )}
                                </div>

                                {/* VS */}
                                <div>
                                  <div style={{ fontSize: 12, opacity: 0.8 }}>VS</div>
                                  {isEditing ? (
                                    <input
                                      className="students-search"
                                      value={toStringSafe(draft.vs)}
                                      onChange={(e) => setDraftField(s.id, "vs", e.target.value)}
                                    />
                                  ) : (
                                    <div>{s.vs || "-"}</div>
                                  )}
                                </div>

                                {/* IBAN */}
                                <div>
                                  <div style={{ fontSize: 12, opacity: 0.8 }}>IBAN</div>
                                  {isEditing ? (
                                    <input
                                      className="students-search"
                                      value={toStringSafe(draft.iban)}
                                      onChange={(e) => setDraftField(s.id, "iban", e.target.value)}
                                    />
                                  ) : (
                                    <div>{s.iban || "-"}</div>
                                  )}
                                </div>

                                {/* PAYMENT TYPE */}
                                <div>
                                  <div style={{ fontSize: 12, opacity: 0.8 }}>Typ platby</div>
                                  {isEditing ? (
                                    <input
                                      className="students-search"
                                      value={toStringSafe(draft.typeOfPayment)}
                                      onChange={(e) => setDraftField(s.id, "typeOfPayment", e.target.value)}
                                    />
                                  ) : (
                                    <div>{s.typeOfPayment || "-"}</div>
                                  )}
                                </div>

                                {/* PERIOD */}
                                <div>
                                  <div style={{ fontSize: 12, opacity: 0.8 }}>Period</div>
                                  {isEditing ? (
                                    <input
                                      className="students-search"
                                      value={toStringSafe(draft.period)}
                                      onChange={(e) => setDraftField(s.id, "period", e.target.value)}
                                    />
                                  ) : (
                                    <div>{s.period || "-"}</div>
                                  )}
                                </div>

                                {/* AMOUNT */}
                                <div>
                                  <div style={{ fontSize: 12, opacity: 0.8 }}>Suma</div>
                                  {isEditing ? (
                                    <input
                                      className="students-search"
                                      value={toStringSafe(draft.amount)}
                                      onChange={(e) => setDraftField(s.id, "amount", e.target.value)}
                                    />
                                  ) : (
                                    <div>{s.amount ?? "-"}</div>
                                  )}
                                </div>

                                {/* NOTE */}
                                <div style={{ gridColumn: "1 / -1" }}>
                                  <div style={{ fontSize: 12, opacity: 0.8 }}>Poznámka</div>
                                  {isEditing ? (
                                    <textarea
                                      className="students-search"
                                      style={{ minHeight: 70, resize: "vertical" }}
                                      value={toStringSafe(draft.note)}
                                      onChange={(e) => setDraftField(s.id, "note", e.target.value)}
                                    />
                                  ) : (
                                    <div>{s.note || "-"}</div>
                                  )}
                                </div>

                                {/* BONUS: Show "other" fields (read-only) so existing doc fields are visible */}
                                {!isEditing && (
                                  <div style={{ gridColumn: "1 / -1", marginTop: 8, opacity: 0.9 }}>
                                    <details>
                                      <summary>Ostatné polia v dokumente (read-only)</summary>
                                      <pre style={{ whiteSpace: "pre-wrap" }}>
                                        {JSON.stringify(
                                          Object.fromEntries(
                                            Object.entries(s).filter(([k]) => !["id"].includes(k))
                                          ),
                                          null,
                                          2
                                        )}
                                      </pre>
                                    </details>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}

                      {/* PAYMENTS */}
                      {isPaymentsOpen && (
                        <tr className="payments-row">
                          <td colSpan={8}>
                            {studentPayments.length === 0 ? (
                              <div className="payments-empty">
                                Žiadne platby pre VS: <b>{s.vs}</b>
                              </div>
                            ) : (
                              <div className="payments-inner">
                                <table className="payments-mini-table">
                                  <thead>
                                    <tr>
                                      <th>Dátum</th>
                                      <th>Suma</th>
                                      <th>Odosielateľ</th>
                                      <th>Správa</th>
                                      <th>Stav</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {studentPayments.map((p) => {
                                      const isMatchedToThisStudent = p.matchedStudentId === s.id;

                                      return (
                                        <tr key={p.id}>
                                          <td>{p.date ? p.date.toLocaleString("sk-SK") : "-"}</td>
                                          <td>{typeof p.amount === "number" ? p.amount : String(p.amount)}</td>
                                          <td>{p.senderName || p.senderIban || "-"}</td>
                                          <td className="message-cell">{p.message || "-"}</td>

                                          <td>
                                            <span className={`status-badge ${isMatchedToThisStudent ? "matched" : "unmatched"}`}>
                                              {isMatchedToThisStudent ? "Priradené" : "Nepriradené"}
                                            </span>

                                            {!isMatchedToThisStudent && (
                                              <button className="btn-small" onClick={() => assignPaymentToStudent(p.id, s.id)}>
                                                Spárovať
                                              </button>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentsManagement;
