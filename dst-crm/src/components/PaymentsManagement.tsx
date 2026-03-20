import React, { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  orderBy,
  where,
  updateDoc,
  doc,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../config/firebase";
import "../styles/PaymentsManagement.css"; // component-specific styles

// Types
interface PaymentInfo {
  id?: string;
  vs: string;
  amount: number | string;
  date: Date | null;
  message?: string;
  senderIban?: string;
  senderName?: string;
  matchedStudentId?: string | null;
  matchStatus?: "matched" | "unmatched" | "ambiguous";
  createdAt?: Date | null;
}

interface StudentShort {
  id: string;
  name?: string;
  surname?: string;
  vs?: string;
  school?: string;
}
type StatusFilter = "all" | "matched" | "unmatched" | "ambiguous";

interface PaymentsManagementProps {
  selectedCohort?: string;
}

const getCohortFromVS = (vs?: string) => {
  const clean = String(vs ?? "").trim();
  if (clean.length < 4) return "";
  return clean.slice(0, 4);
};

export const PaymentsManagement: React.FC<PaymentsManagementProps> = ({ selectedCohort = "all" }) => {
  // Main component state: payment data + UX states for operations and feedback.
  const [payments, setPayments] = useState<PaymentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">(
    "success"
  );

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // assignment helper state
  const [searchVS, setSearchVS] = useState("");
  const [studentResults, setStudentResults] = useState<StudentShort[]>([]);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(
    null
  );
  const [assigning, setAssigning] = useState(false);
  const [autoPairing, setAutoPairing] = useState(false);

  useEffect(() => {
    // Mount-time fetch after first render.
    loadPayments();
  }, [selectedCohort]);

  const loadPayments = async () => {
    setLoading(true);
    try {
      // Query + orderBy pattern: centralized payment overview from newest to oldest.
      const paymentsQ = query(
        collection(db, "payments"),
        orderBy("date", "desc")
      );
      const snap = await getDocs(paymentsQ);
      const list: PaymentInfo[] = [];
      // EN: Loaded payments count
      console.log("Načítané platby:", snap.size);
      snap.forEach((d) => {
        const data = d.data() as any;
        list.push({
          id: d.id,
          vs: data.vs !== undefined && data.vs !== null ? String(data.vs) : "",
          amount: data.amount ?? data.AMount ?? 0,
          date: data.date?.toDate ? data.date.toDate() : data.date ?? null,
          message: data.message ?? "",
          senderIban: data.senderIban ?? "",
          senderName: data.senderName ?? "",
          matchedStudentId: data.matchedStudentId ?? null,
          matchStatus:
            data.matchStatus ??
            (data.matchedStudentId ? "matched" : "unmatched"),
          createdAt: data.createdAt?.toDate
            ? data.createdAt.toDate()
            : data.createdAt ?? null,
        });
      });

      const studentsSnap = await getDocs(collection(db, "students"));
      const byId = new Map<string, StudentShort>();
      studentsSnap.forEach((s) => {
        const data = s.data() as any;
        byId.set(s.id, {
          id: s.id,
          name: data.name ?? "",
          surname: data.surname ?? "",
          vs: data.vs !== undefined && data.vs !== null ? String(data.vs) : "",
          school: data.school ?? "",
        });
      });
      const cohortPayments = selectedCohort === "all"
        ? list
        : list.filter((payment) => {
            if (getCohortFromVS(payment.vs) === selectedCohort) return true;
            const sid = String(payment.matchedStudentId ?? "").trim();
            if (!sid) return false;
            const student = byId.get(sid);
            return getCohortFromVS(student?.vs) === selectedCohort;
          });

      setPayments(cohortPayments);
    } catch (err) {
      // EN: Error while loading payments
      console.error("Chyba pri načítaní platieb:", err);
      setMessage("Chyba pri načítaní platieb");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  };

  const removeAssignment = async (paymentId: string) => {
    try {
      // Revert match: reset matchedStudentId and set status back to unmatched.
      await updateDoc(doc(db, "payments", paymentId), {
        matchedStudentId: null,
        matchStatus: "unmatched",
      });
      setMessage("Priradenie bolo odstránené.");
      setMessageType("success");
      loadPayments();
    } catch (err) {
      // EN: Error while removing assignment
      console.error("Chyba pri odstraňovaní priradenia:", err);
      setMessage("Chyba pri odstraňovaní priradenia");
      setMessageType("error");
    }
  };

  const deletePayment = async (paymentId: string) => {
    // EN: Are you sure you want to delete this payment?
    if (!confirm("Naozaj chcete vymazať túto platbu?")) return;
    try {
      await deleteDoc(doc(db, "payments", paymentId));
      setMessage("Platba bola vymazaná.");
      setMessageType("success");
      loadPayments();
    } catch (err) {
      // EN: Error while deleting payment
      console.error("Chyba pri mazaní platby:", err);
      setMessage("Chyba pri mazaní platby");
      setMessageType("error");
    }
  };

  // Search students by VS (quick lookup during assignment)
  const searchStudentsByVS = async (vs: string) => {
    setStudentResults([]);
    if (!vs.trim()) return;
    try {
      // VS lookup is the core of manual payment-to-student matching.
      const q = query(collection(db, "students"), where("vs", "==", vs));
      const snap = await getDocs(q);
      const res: StudentShort[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        res.push({
          id: d.id,
          name: data.name,
          surname: data.surname,
          vs: data.vs !== undefined && data.vs !== null ? String(data.vs) : "",
          school: data.school,
        });
      });
      setStudentResults(res);
    } catch (err) {
      // EN: Error while searching students
      console.error("Chyba pri hľadaní študentov:", err);
      setMessage("Chyba pri hľadaní študentov");
      setMessageType("error");
    }
  };

  const assignToStudent = async (paymentId: string, studentId: string) => {
    setAssigning(true);
    try {
      console.log("=== PRIRADENIE PLATBY ===");
      console.log("Payment ID:", paymentId);
      console.log("Student ID:", studentId);
      
      // Atomic update of one payment document during manual matching.
      await updateDoc(doc(db, "payments", paymentId), {
        matchedStudentId: studentId,
        matchStatus: "matched",
      });
      
      console.log("Platba úspešne priradená!"); // EN: Payment assigned successfully!
      
      setMessage("Platba priradená ku študentovi.");
      setMessageType("success");
      setSelectedPaymentId(null);
      setStudentResults([]);
      setSearchVS("");
      loadPayments();
    } catch (err) {
      // EN: Error while assigning payment
      console.error("Chyba pri priraďovaní platby:", err);
      setMessage("Chyba pri priraďovaní platby");
      setMessageType("error");
    } finally {
      setAssigning(false);
    }
  };

  const normalizeVS = (value: any) =>
    value === undefined || value === null ? "" : String(value).trim();

  const autoAssignByVS = async () => {
    setAutoPairing(true);
    setMessage("");
    try {
      // Auto-pairing algorithm: students map (vs -> ids) + candidate payment traversal.
      const studentsSnap = await getDocs(collection(db, "students"));
      const studentsByVS = new Map<string, string[]>();

      studentsSnap.forEach((studentDoc) => {
        const data = studentDoc.data() as any;
        const vs = normalizeVS(data.vs);
        if (!vs) return;
        if (!studentsByVS.has(vs)) studentsByVS.set(vs, []);
        studentsByVS.get(vs)!.push(studentDoc.id);
      });

      const candidates = payments.filter(
        (payment) => (payment.matchStatus ?? "unmatched") !== "matched" || !payment.matchedStudentId
      );

      let matchedCount = 0;
      let ambiguousCount = 0;
      let unchangedCount = 0;

      const batchUpdates: Array<{ id: string; data: { matchedStudentId: string | null; matchStatus: "matched" | "unmatched" | "ambiguous" } }> = [];

      for (const payment of candidates) {
        if (!payment.id) continue;
        const vs = normalizeVS(payment.vs);
        if (!vs) {
          unchangedCount += 1;
          continue;
        }

        const matchedStudents = studentsByVS.get(vs) ?? [];

        if (matchedStudents.length === 1) {
          const targetStudentId = matchedStudents[0];
          if (
            payment.matchedStudentId !== targetStudentId ||
            (payment.matchStatus ?? "unmatched") !== "matched"
          ) {
            batchUpdates.push({
              id: payment.id,
              data: { matchedStudentId: targetStudentId, matchStatus: "matched" },
            });
            matchedCount += 1;
          } else {
            unchangedCount += 1;
          }
        } else if (matchedStudents.length > 1) {
          if (
            payment.matchedStudentId !== null ||
            (payment.matchStatus ?? "unmatched") !== "ambiguous"
          ) {
            batchUpdates.push({
              id: payment.id,
              data: { matchedStudentId: null, matchStatus: "ambiguous" },
            });
            ambiguousCount += 1;
          } else {
            unchangedCount += 1;
          }
        } else {
          unchangedCount += 1;
        }
      }

      // Batch write technique: chunking under Firestore's 500 operations per batch limit.
      for (let index = 0; index < batchUpdates.length; index += 450) {
        const chunk = batchUpdates.slice(index, index + 450);
        const batch = writeBatch(db);
        chunk.forEach((updateItem) => {
          batch.update(doc(db, "payments", updateItem.id), updateItem.data);
        });
        await batch.commit();
      }

      setMessage(
        `Auto-spárovanie dokončené. Spárované: ${matchedCount}, Nejednoznačné: ${ambiguousCount}, Bez zmeny: ${unchangedCount}`
      );
      setMessageType("success");
      await loadPayments();
    } catch (err) {
      // EN: Error during VS auto-matching
      console.error("Chyba pri auto-spárovaní podľa VS:", err);
      setMessage("Chyba pri auto-spárovaní podľa VS");
      setMessageType("error");
    } finally {
      setAutoPairing(false);
    }
  };

  const filteredPayments = payments.filter((p) => {
    // Client-side filter simplifies status view switches without another DB query.
    if (statusFilter === "all") return true;
    return (p.matchStatus ?? "unmatched") === statusFilter;
  });

  const cohortTitle = selectedCohort === "all" ? "Všetky ročníky" : `Ročník ${selectedCohort}`;

  if (loading) {
    // EN: Loading payments...
    return (
      <div className="payments-management-container">Načítavam platby...</div>
    );
  }

  return (
    <div className="payments-management-container">
      <div className="payments-management-header">
        <h2>Správa platieb {/* EN: Payments management */}</h2>
        <p>
          Prehľad importovaných platieb, priraďovanie k študentom a ich správa {/* EN: Overview of imported payments, matching to students, and management */}
        </p>
        <p style={{ marginTop: 8 }}>Aktívny filter ročníka: <b>{cohortTitle}</b> {/* EN: Active cohort filter */}</p>
      </div>

      {message && (
        <div className={`message message-${messageType}`}>{message}</div>
      )}

      <div className="payments-card">
        {payments.length === 0 ? (
          <p className="empty-message">
            Žiadne platby pre filter:{" "} {/* EN: No payments for filter */}
            {statusFilter === "all"
              ? "Všetky" // EN: All
              : statusFilter === "matched"
              ? "Priradené" // EN: Matched
              : statusFilter === "ambiguous"
              ? "Nejednoznačné" // EN: Ambiguous
              : "Nepriradené" // EN: Unmatched
            }
          </p>
        ) : (
          <>
            <div className="filters-bar">
              <div className="filters-left">
                <span className="filters-label">Filter: {/* EN: Filter */}</span>

                <button
                  className={`filter-chip ${
                    statusFilter === "all" ? "active" : ""
                  }`}
                  onClick={() => setStatusFilter("all")}
                >
                  Všetky ({payments.length}) {/* EN: All */}
                </button>

                <button
                  className={`filter-chip ${
                    statusFilter === "unmatched" ? "active" : ""
                  }`}
                  onClick={() => setStatusFilter("unmatched")}
                >
                  Nepriradené ( {/* EN: Unmatched */}
                  {
                    payments.filter(
                      (p) => (p.matchStatus ?? "unmatched") === "unmatched"
                    ).length
                  }
                  )
                </button>

                <button
                  className={`filter-chip ${
                    statusFilter === "matched" ? "active" : ""
                  }`}
                  onClick={() => setStatusFilter("matched")}
                >
                  Priradené ( {/* EN: Matched */}
                  {payments.filter((p) => p.matchStatus === "matched").length})
                </button>

                <button
                  className={`filter-chip ${
                    statusFilter === "ambiguous" ? "active" : ""
                  }`}
                  onClick={() => setStatusFilter("ambiguous")}
                >
                  Nejednoznačné ( {/* EN: Ambiguous */}
                  {payments.filter((p) => p.matchStatus === "ambiguous").length}
                  )
                </button>
              </div>

              <div className="filters-right">
                <button
                  className="filter-chip"
                  onClick={autoAssignByVS}
                  disabled={autoPairing}
                >
                  {autoPairing ? "Párujem podľa VS..." /* EN: Matching by VS... */ : "Auto-spárovať podľa VS" /* EN: Auto-match by VS */}
                </button>
                <span className="filters-count">
                  Zobrazené: <b>{filteredPayments.length}</b> {/* EN: Displayed */}
                </span>
              </div>
            </div>
            <div className="payments-table-wrapper">
              <table className="payments-table">
                <thead>
                  <tr>
                    <th>VS</th>
                    <th>Sum</th>
                    <th>Dátum {/* EN: Date */}</th>
                    <th>Odosielateľ {/* EN: Sender */}</th>
                    <th>Správa {/* EN: Message */}</th>
                    <th>Stav {/* EN: Status */}</th>
                    <th>Priradené k {/* EN: Assigned to */}</th>
                    <th>Akcia {/* EN: Action */}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((p) => (
                    <React.Fragment key={p.id}>
                      <tr>
                        <td>{p.vs || "-"}</td>
                        <td>
                          {typeof p.amount === "number"
                            ? (p.amount / 100).toFixed(2) // ak máš uložené v centoch
                            : String(p.amount)}
                        </td>
                        <td>
                          {p.date
                            ? new Date(p.date).toLocaleString("sk-SK")
                            : "-"}
                        </td>
                        <td>{p.senderName || p.senderIban || "-"}</td>
                        <td className="message-cell">{p.message || "-"}</td>
                        <td>
                          <span
                            className={`status-badge ${
                              p.matchStatus || "unmatched"
                            }`}
                          >
                            {p.matchStatus === "matched"
                              ? "Priradené" // EN: Matched
                              : p.matchStatus === "ambiguous"
                              ? "Nejednoznačné" // EN: Ambiguous
                              : "Nepriradené" // EN: Unmatched
                            }
                          </span>
                        </td>
                        <td>{p.matchedStudentId ?? "-"}</td>
                        <td>
                          <button
                            onClick={() => {
                              setSelectedPaymentId(p.id ?? null);
                              setSearchVS(p.vs ?? "");
                              searchStudentsByVS(p.vs ?? "");
                            }}
                          >
                            Priradiť {/* EN: Assign */}
                          </button>

                          {p.matchStatus === "matched" && p.matchedStudentId && (
                            <button
                              onClick={() => removeAssignment(p.id!)}
                            >
                              Vyčistiť {/* EN: Clear */}
                            </button>
                          )}

                          <button
                            onClick={() => deletePayment(p.id!)}
                            className="danger"
                          >
                            Vymazať {/* EN: Delete */}
                          </button>
                        </td>
                      </tr>

                      {/* Assignment panel - shown below the payment row */}
                      {selectedPaymentId === p.id && (
                        <tr className="assign-payment-row">
                          <td colSpan={8}>
                            <div className="assign-panel">
                              <h3>Priradiť platbu {/* EN: Assign payment */}</h3>
                              <div className="assign-row">
                                <label>Hľadaj študenta podľa VS: {/* EN: Search student by VS */}</label>
                                {/* EN: Enter VS... */}
                                <input
                                  type="text"
                                  placeholder="Zadaj VS..."
                                  value={searchVS}
                                  onChange={(e) => {
                                    setSearchVS(e.target.value);
                                    searchStudentsByVS(e.target.value);
                                  }}
                                />
                                <button
                                  onClick={() => setSelectedPaymentId(null)}
                                >
                                  Zatvoriť {/* EN: Close */}
                                </button>
                              </div>

                              {studentResults.length > 0 && (
                                <div className="search-results">
                                  <table className="search-table">
                                    <thead>
                                      <tr>
                                        <th>Meno {/* EN: Name */}</th>
                                        <th>VS</th>
                                        <th>Škola {/* EN: School */}</th>
                                        <th>Akcia {/* EN: Action */}</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {studentResults.map((s) => (
                                        <tr key={s.id}>
                                          <td>{(s.name || "") + " " + (s.surname || "")}</td>
                                          <td>{s.vs}</td>
                                          <td>{s.school || "-"}</td>
                                          <td>
                                            <button
                                              onClick={() =>
                                                assignToStudent(selectedPaymentId, s.id)
                                              }
                                              disabled={assigning}
                                            >
                                              Priradiť k tomuto študentovi {/* EN: Assign to this student */}
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PaymentsManagement;
