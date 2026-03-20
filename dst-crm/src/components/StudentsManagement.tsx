import React, { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc, where, writeBatch } from "firebase/firestore";
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
  selectedCohort?: string;
}

const getCohortFromVS = (vs?: string) => {
  const clean = String(vs ?? "").trim();
  if (clean.length < 4) return "";
  return clean.slice(0, 4);
};

export const StudentsManagement: React.FC<StudentsManagementProps> = ({ onRemindersChanged, selectedCohort = "all" }) => {
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
  const [deletingById, setDeletingById] = useState<Record<string, boolean>>({});
  const [deletingCohort, setDeletingCohort] = useState(false);

  useEffect(() => {
    // One-shot initial load bez realtime listenerov.
    loadAll();
  }, [selectedCohort]);

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

      const cohortStudents = selectedCohort === "all"
        ? studentsList
        : studentsList.filter((s) => getCohortFromVS(s.vs) === selectedCohort);
      const cohortVSSet = new Set(cohortStudents.map((s) => String(s.vs ?? "").trim()).filter(Boolean));
      const cohortPayments = selectedCohort === "all"
        ? paymentsList
        : paymentsList.filter((p) => cohortVSSet.has(String(p.vs ?? "").trim()));

      setStudents(cohortStudents);
      setPayments(cohortPayments);
      const remindersCount = cohortStudents.filter((s) => s.noteNeedsReview).length;
      onRemindersChanged?.(remindersCount);

      // Draft-cache pattern: local edit buffer separated from original DB data.
      setDraftById((prev) => {
        const next = { ...prev };
        for (const s of cohortStudents) {
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
      // EN: Error while loading students/payments
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
      // EN: Error while matching payment
      console.error("Chyba pri párovaní:", err);
      // EN: Payment matching error
      setMessage("Chyba pri párovaní platby");
      setMessageType("error");
    }
  };

  const runBatchInChunks = async <T,>(
    items: T[],
    apply: (batch: ReturnType<typeof writeBatch>, item: T) => void,
    chunkSize = 450
  ) => {
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach((item) => apply(batch, item));
      await batch.commit();
    }
  };

  const getPaymentsForStudent = async (student: StudentData) => {
    const studentId = String(student.id);
    const matchedByIdSnap = await getDocs(
      query(collection(db, "payments"), where("matchedStudentId", "==", studentId))
    );
    return matchedByIdSnap.docs;
  };

  const deleteStudent = async (student: StudentData) => {
    const fullName = `${student.name ?? ""} ${student.surname ?? ""}`.trim() || "bez mena";
    // EN: Are you sure you want to delete this student? Only matched payments will be deleted. This action cannot be undone.
    const confirmed = window.confirm(
      `Naozaj chcete vymazať študenta ${fullName}? Vymažú sa iba priradené platby (matched). Táto akcia sa nedá vrátiť späť.`
    );
    if (!confirmed) return;

    setDeletingById((prev) => ({ ...prev, [student.id]: true }));
    setMessage("");

    try {
      const paymentDocs = await getPaymentsForStudent(student);
      await runBatchInChunks(paymentDocs, (batch, paymentDoc) => {
        batch.delete(doc(db, "payments", paymentDoc.id));
      });

      await deleteDoc(doc(db, "students", student.id));

      setMessage(`Študent ${fullName} bol vymazaný spolu s platbami (${paymentDocs.length}).`);
      setMessageType("success");
      await loadAll();
    } catch (err) {
      // EN: Error while deleting student
      console.error("Chyba pri mazaní študenta:", err);
      setMessage("Chyba pri mazaní študenta");
      setMessageType("error");
    } finally {
      setDeletingById((prev) => ({ ...prev, [student.id]: false }));
    }
  };

  const deleteSelectedCohort = async () => {
    if (selectedCohort === "all") return;

    const cohortStudents = students.filter((s) => getCohortFromVS(s.vs) === selectedCohort);
    if (cohortStudents.length === 0) {
      // EN: No students to delete in this cohort
      setMessage("V tomto ročníku nie sú žiadni študenti na vymazanie.");
      setMessageType("error");
      return;
    }

    // EN: Are you sure you want to delete the whole cohort? Only matched payments will be deleted. This action cannot be undone.
    const confirmed = window.confirm(
      `Naozaj chcete vymazať celý ročník ${selectedCohort}? Počet študentov: ${cohortStudents.length}. Vymažú sa iba priradené platby (matched). Táto akcia sa nedá vrátiť späť.`
    );
    if (!confirmed) return;

    setDeletingCohort(true);
    setMessage("");

    try {
      const studentIds = new Set(cohortStudents.map((s) => s.id));

      const allPaymentsSnap = await getDocs(collection(db, "payments"));
      const relatedPayments = allPaymentsSnap.docs.filter((p) => {
        const data = p.data() as any;
        const matchedStudentId = data.matchedStudentId ? String(data.matchedStudentId) : "";
        return studentIds.has(matchedStudentId);
      });

      await runBatchInChunks(relatedPayments, (batch, paymentDoc) => {
        batch.delete(doc(db, "payments", paymentDoc.id));
      });

      await runBatchInChunks(cohortStudents, (batch, s) => {
        batch.delete(doc(db, "students", s.id));
      });

      setMessage(
        `Ročník ${selectedCohort} bol vymazaný (študenti: ${cohortStudents.length}, platby: ${relatedPayments.length}).`
      );
      setMessageType("success");
      await loadAll();
    } catch (err) {
      // EN: Error while deleting cohort
      console.error("Chyba pri mazaní ročníka:", err);
      setMessage("Chyba pri mazaní ročníka");
      setMessageType("error");
    } finally {
      setDeletingCohort(false);
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
      // EN: Error while saving student
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
      // EN: Error while marking note as reviewed
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
      // EN: Error while marking all notes as reviewed
      console.error("Chyba pri hromadnom označení poznámok:", err);
      setMessage("Chyba pri hromadnom označení poznámok");
      setMessageType("error");
    }
  };

  const pendingNoteReminders = students.filter((s) => s.noteNeedsReview).length;

  if (loading) {
    // EN: Loading students...
    return <div className="students-management-container">Načítavam študentov...</div>;
  }

  return (
    <div className="students-management-container">
      <div className="students-management-header">
        <h2>Správa študentov {/* EN: Student management */}</h2>
        <p>Prehľad všetkých študentov, profil a platby {/* EN: Overview of all students, profile, and payments */}</p>
      </div>

      {message && <div className={`message message-${messageType}`}>{message}</div>}

      {pendingNoteReminders > 0 && (
        <div className="note-reminder-banner">
          <span>
            Nové študentské poznámky na kontrolu: <b>{pendingNoteReminders}</b> {/* EN: New student notes to review */}
          </span>
          <button className="btn btn-warning" onClick={markAllNotesAsReviewed}>
            Označiť všetko ako skontrolované {/* EN: Mark all as reviewed */}
          </button>
        </div>
      )}

      <div className="students-card">
        <div className="students-toolbar">
          {/* EN: Search (name, surname, email, school, VS)... */}
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
              Nové správy {/* EN: New messages */}
            </button>
            <button
              className={`btn ${noteReminderFilter === "all" ? "btn-filter-active" : ""}`}
              onClick={() => setNoteReminderFilter("all")}
              type="button"
            >
              Zobraziť všetkých {/* EN: Show all */}
            </button>
          </div>

          <select
            className="students-filter"
            value={noteReminderFilter}
            onChange={(e) => setNoteReminderFilter(e.target.value as "all" | "pending")}
            title="Filter poznámok"
          >
            <option value="all">Všetci študenti {/* EN: All students */}</option>
            <option value="pending">Len nové poznámky {/* EN: Only new notes */}</option>
          </select>

          <span className="students-count">
            Zobrazené: <b>{filteredStudents.length}</b> / {students.length} {/* EN: Displayed */}
          </span>

          <button
            className="btn btn-danger"
            type="button"
            onClick={deleteSelectedCohort}
            disabled={selectedCohort === "all" || deletingCohort || students.length === 0}
            title={selectedCohort === "all" ? "Najprv vyberte konkrétny ročník v Dashboardi" : "Vymazať celý aktuálne zvolený ročník"}
          >
            {deletingCohort ? "Mažem ročník..." /* EN: Deleting cohort... */ : "Vymazať ročník" /* EN: Delete cohort */}
          </button>
        </div>

        {filteredStudents.length === 0 ? (
          <p className="empty-message">Žiadni študenti pre dané hľadanie {/* EN: No students for this search */}</p>
        ) : (
          <div className="students-table-wrapper">
            <table className="students-table">
              <thead>
                <tr>
                  <th>Meno {/* EN: Name */}</th>
                  <th>Mail</th>
                  <th>Škola {/* EN: School */}</th>
                  <th>Región {/* EN: Region */}</th>
                  <th>Poznámka {/* EN: Note */}</th>
                  <th>VS</th>
                  <th>Platby {/* EN: Payments */}</th>
                  <th>Akcia {/* EN: Action */}</th>
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
                  const isDeleting = !!deletingById[s.id];

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

                          <button
                            className="btn btn-danger"
                            onClick={() => deleteStudent(s)}
                            disabled={isDeleting}
                            title="Vymazať tohto študenta"
                          >
                            {isDeleting ? "Mažem..." : "Vymazať"}
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
                                {/* NAME */}
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

                                {/*  SURNAME */}
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

                                {/* Show "other" fields (read-only) so existing doc fields are visible */}
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
