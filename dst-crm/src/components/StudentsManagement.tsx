import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query, updateDoc, doc } from "firebase/firestore";
import { db } from "../config/firebase";
import "../styles/StudentsManagement.css";

type MatchStatus = "matched" | "unmatched" | "ambiguous";

interface StudentData {
  id: string;

  // “známe” polia (aby si mal typy + autocomplete)
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
  vs?: string; // drž ako string

  createdAt?: Date | null;

  // ak máš ďalšie polia v students kolekcii, zachytíme ich sem:
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
  if (!v) return null;
  if (v?.toDate) return v.toDate();
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};

const toStringSafe = (v: any) => (v === undefined || v === null ? "" : String(v));

export const StudentsManagement: React.FC = () => {
  const [students, setStudents] = useState<StudentData[]>([]);
  const [payments, setPayments] = useState<PaymentInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");

  // rozbalené sekcie
  const [expandedPayments, setExpandedPayments] = useState<Record<string, boolean>>({});
  const [expandedProfile, setExpandedProfile] = useState<Record<string, boolean>>({});

  // hľadanie
  const [search, setSearch] = useState("");

  // edit režim + draft dáta
  const [editModeById, setEditModeById] = useState<Record<string, boolean>>({});
  const [draftById, setDraftById] = useState<Record<string, Partial<StudentData>>>({});
  const [savingById, setSavingById] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    setMessage("");
    try {
      // 1) Students
      const studentsSnap = await getDocs(collection(db, "students"));
      const studentsList: StudentData[] = studentsSnap.docs.map((d) => {
        const data = d.data() as any;

        // všetky polia prekopírujeme (komplexnejší profil)
        const student: StudentData = {
          id: d.id,
          ...data,
          // normalizácie:
          vs: data.vs !== undefined && data.vs !== null ? String(data.vs) : "",
          createdAt: toDateSafe(data.createdAt),
        };

        return student;
      });

      // 2) Payments (zoradené podľa date desc)
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

      // Sort students (podľa priezviska, mena)
      studentsList.sort((a, b) => {
        const as = `${a.surname ?? ""} ${a.name ?? ""}`.toLowerCase();
        const bs = `${b.surname ?? ""} ${b.name ?? ""}`.toLowerCase();
        return as.localeCompare(bs);
      });

      setStudents(studentsList);
      setPayments(paymentsList);

      // ak ešte nemáš draft pre študentov, predvyplníme
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

  // Map: vs -> payments[]
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
    const q = search.trim().toLowerCase();
    if (!q) return students;

    return students.filter((s) => {
      const blob = `${s.name ?? ""} ${s.surname ?? ""} ${s.mail ?? ""} ${s.school ?? ""} ${s.vs ?? ""} ${s.telephoneNumber ?? ""}`.toLowerCase();
      return blob.includes(q);
    });
  }, [students, search]);

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
        // ak chceš editovať aj ďalšie custom polia z kolekcie students,
        // doplň ich sem (alebo sprav dynamický editor).
      },
    }));
  };

  const cancelEdit = (student: StudentData) => {
    setEditModeById((prev) => ({ ...prev, [student.id]: false }));
    // reset draft na aktuálne hodnoty
    startEdit(student);
    // ale startEdit by znovu zapol editMode, tak to spravíme ručne:
    setEditModeById((prev) => ({ ...prev, [student.id]: false }));
  };

  const saveStudent = async (studentId: string) => {
    const draft = draftById[studentId] ?? {};
    setSavingById((prev) => ({ ...prev, [studentId]: true }));
    setMessage("");

    try {
      // normalizácie pred uložením
      const payload: any = {
        ...draft,
        vs: draft.vs !== undefined && draft.vs !== null ? String(draft.vs) : "",
      };

      // amount: skús prehodiť na číslo ak je to číselný string
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

      <div className="students-card">
        <div className="students-toolbar">
          <input
            className="students-search"
            placeholder="Hľadať (meno, priezvisko, mail, škola, VS)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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
                      {/* RIADOK ŠTUDENTA */}
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

                                {/* TELEFÓN */}
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

                                {/* ŠKOLA */}
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

                                {/* REGIÓN */}
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

                                {/* TYP PLATBY */}
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

                                {/* BONUS: Zobrazenie “ostatných” fields (read-only), aby si videl čo ešte existuje v docs */}
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

                      {/* PLATBY */}
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
