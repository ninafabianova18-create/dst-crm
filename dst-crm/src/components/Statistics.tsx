import React, { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../config/firebase";
import "../styles/Statistics.css";

interface StudentData {
  id: string;
  name?: string;
  surname?: string;
  mail?: string;
  school?: string;
  amount?: number;
  period?: string;
}

interface PaymentInfo {
  id: string;
  vs: string;
  amount: number;
  date?: Date | null;
  matchedStudentId?: string | null;
}

interface FinanceStats {
  paid: number;
  expected: number;
  difference: number;
  final: number;
}

export const Statistics: React.FC = () => {
  const [tab, setTab] = useState<'overview' | 'finance'>('overview');
  const [students, setStudents] = useState<StudentData[]>([]);
  const [payments, setPayments] = useState<PaymentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [regions, setRegions] = useState<string[]>([]);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      // Načítaj študentov
      const studentsSnap = await getDocs(collection(db, "students"));
      const studentsList: StudentData[] = studentsSnap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          name: data.name ?? "",
          surname: data.surname ?? "",
          mail: data.mail ?? "",
          school: data.school ?? "",
          amount: typeof data.amount === "number" ? data.amount : Number(data.amount ?? 0),
          period: data.period ?? "",
        };
      });

      // Načítaj platby
      const paymentsQ = query(collection(db, "payments"), orderBy("date", "desc"));
      const paymentsSnap = await getDocs(paymentsQ);
      const paymentsList: PaymentInfo[] = paymentsSnap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          vs: data.vs ?? "",
          amount: typeof data.amount === "number" ? data.amount : Number(data.amount ?? 0),
          date: data.date?.toDate ? data.date.toDate() : data.date ?? null,
          matchedStudentId: data.matchedStudentId ?? null,
        };
      });

      // Extrakt regióny (kraje) z údajov o školách
      const uniqueRegions = [...new Set(studentsList.map(s => s.school || "Neznámy kraj"))];
      setRegions(uniqueRegions.sort());

      setStudents(studentsList);
      setPayments(paymentsList);
    } catch (err) {
      console.error("Chyba pri načítaní štatistík:", err);
    } finally {
      setLoading(false);
    }
  };

  // Vypočítaj Finance štatistiky pre všetkých študentov
  const calculateFinanceStats = (studentIds?: string[]): FinanceStats => {
    const relevantStudents = studentIds 
      ? students.filter(s => studentIds.includes(s.id))
      : students;

    // Paid: suma všetkých platieb
    const paid = payments.reduce((acc, p) => {
      if (studentIds && p.matchedStudentId && !studentIds.includes(p.matchedStudentId)) {
        return acc;
      }
      return acc + (p.amount || 0);
    }, 0);

    // Expected: suma platieb očakávaných v danom období
    // Logika: rok začína v septembri (mesiac 9)
    // Oktober: všetci, Nov-Dec-Jan: len mesačne, Feb: mesačne+polročne, Mar-Jul: len mesačne
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1; // 1-12
    
    // Zistiť, v ktorom akademickom mesiaci sme (0 = september, 1 = október, ...)
    let academicMonth = currentMonth - 9;
    if (academicMonth <= 0) {
      academicMonth += 12; // ak sme pred septembrom, pridaj 12
    }

    let expected = 0;
    for (const student of relevantStudents) {
      const period = (student.period ?? "").toLowerCase();
      const monthlyAmount = student.amount || 0;

      if (period === "month" || period === "monthly") {
        // Mesačne sa očakáva všetky mesiace
        expected += monthlyAmount;
      } else if (period === "half-year" || period === "halfyear" || period === "half year") {
        // Polročne: február je 5. akademický mesiac
        if (academicMonth === 5) {
          expected += monthlyAmount;
        }
      } else if (period === "year" || period === "yearly") {
        // Ročne: október je 1. akademický mesiac
        if (academicMonth === 1) {
          expected += monthlyAmount;
        }
      }
    }

    // Final: celková suma ocakávaných platieb za celý akademický rok
    let final = 0;
    for (const student of relevantStudents) {
      const period = (student.period ?? "").toLowerCase();
      const monthlyAmount = student.amount || 0;

      if (period === "month" || period === "monthly") {
        final += monthlyAmount * 10; // 10 mesiacov (sept-jún ako minimálne)
      } else if (period === "half-year" || period === "halfyear" || period === "half year") {
        final += monthlyAmount * 2; // 2 platby za rok
      } else if (period === "year" || period === "yearly") {
        final += monthlyAmount * 1; // 1 platba za rok
      }
    }

    const difference = paid - expected;

    return { paid, expected, difference, final };
  };

  if (loading) {
    return <div className="statistics-container">Načítavam štatistiky...</div>;
  }

  const overallStats = calculateFinanceStats();
  const totalStudents = students.length;
  const totalPayments = payments.length;

  return (
    <div className="statistics-container">
      <div className="statistics-header">
        <h2>Štatistiky</h2>
        <p>Prehľad platieb a finančných štatistík</p>
      </div>

      {/* Tapy */}
      <div className="stats-tabs">
        <button
          className={`statistics-tab-btn ${
            tab === 'overview'
              ? 'active'
              : ''
          }`}
          onClick={() => setTab('overview')}
        >
          Prehľad
        </button>
        <button
          className={`statistics-tab-btn ${
            tab === 'finance'
              ? 'active'
              : ''
          }`}
          onClick={() => setTab('finance')}
        >
          Finance
        </button>
      </div>

      {/* TAB: PREHĽAD */}
      {tab === 'overview' && (
        <div className="statistics-tab-content">
          <div className="stats-grid">
            <div className="stat-card">
              <div className="statistics-card-header">
                <h3>Počet študentov</h3>
                <p>Aktuálne evidovaní študenti</p>
              </div>
              <p className="stat-value">{totalStudents}</p>
            </div>
            <div className="stat-card">
              <div className="statistics-card-header">
                <h3>Počet platieb</h3>
                <p>Všetky zaznamenané platby</p>
              </div>
              <p className="stat-value">{totalPayments}</p>
            </div>
            <div className="stat-card">
              <div className="statistics-card-header">
                <h3>Celková suma platieb</h3>
                <p>Súčet prijatých platieb</p>
              </div>
              <p className="stat-value">{overallStats.paid.toFixed(2)} €</p>
            </div>
            <div className="stat-card">
              <div className="statistics-card-header">
                <h3>Priemerná platba</h3>
                <p>Priemer na jednu platbu</p>
              </div>
              <p className="stat-value">
                {totalPayments > 0 ? (overallStats.paid / totalPayments).toFixed(2) : 0} €
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB: FINANCE */}
      {tab === 'finance' && (
        <div className="statistics-tab-content">
          {/* Tabuľka so všetkými štatistikami */}
          <div className="finance-table-section">
            <div className="statistics-card-header">
              <h3>Finančný prehľad - Celkom</h3>
              <p>Platené vs. očakávané hodnoty</p>
            </div>
            <div className="finance-table-wrapper">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Platené (Paid)</th>
                    <th>Očakávané (Expected)</th>
                    <th>Rozdiel (Paid - Expected)</th>
                    <th>Celkovo očakávané (Final)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{overallStats.paid.toFixed(2)} €</td>
                    <td>{overallStats.expected.toFixed(2)} €</td>
                    <td className={overallStats.difference >= 0 ? 'positive-diff' : 'negative-diff'}>
                      {overallStats.difference.toFixed(2)} €
                    </td>
                    <td>{overallStats.final.toFixed(2)} €</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Karty podľa krajov (regiónov) */}
          <div className="regions-section">
            <div className="statistics-card-header">
              <h3>Finančný prehľad podľa krajov</h3>
              <p>Rozdelenie podľa škôl a regiónov</p>
            </div>
            <div className="regions-grid">
              {regions.map((region) => {
                const regionStudents = students
                  .filter(s => s.school === region)
                  .map(s => s.id);
                const regionStats = calculateFinanceStats(regionStudents);

                return (
                  <div key={region} className="region-card">
                    <div className="statistics-card-header">
                      <h4>{region}</h4>
                      <p>Regionálny finančný prehľad</p>
                    </div>
                    <div className="region-stats">
                      <div className="region-stat-row">
                        <span className="stat-label">Platené:</span>
                        <span className="stat-number">{regionStats.paid.toFixed(2)} €</span>
                      </div>
                      <div className="region-stat-row">
                        <span className="stat-label">Očakávané:</span>
                        <span className="stat-number">{regionStats.expected.toFixed(2)} €</span>
                      </div>
                      <div className="region-stat-row">
                        <span className="stat-label">Rozdiel:</span>
                        <span className={`stat-number ${
                          regionStats.difference >= 0 ? 'positive-diff' : 'negative-diff'
                        }`}>
                          {regionStats.difference.toFixed(2)} €
                        </span>
                      </div>
                      <div className="region-stat-row">
                        <span className="stat-label">Celkovo:</span>
                        <span className="stat-number">{regionStats.final.toFixed(2)} €</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="refresh-section">
            <button 
              onClick={loadStats}
              className="refresh-btn"
            >
              Obnoviť štatistiky
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Statistics;
