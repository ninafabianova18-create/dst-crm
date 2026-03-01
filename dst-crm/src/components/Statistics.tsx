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
  region?: string;
  Region?: string;
  typeOfPayment?: string;
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
  // Dashboard analytics state: tab switching + source datasets + region filter.
  const [tab, setTab] = useState<'overview' | 'finance' | 'students'>('overview');
  const [students, setStudents] = useState<StudentData[]>([]);
  const [payments, setPayments] = useState<PaymentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [regions, setRegions] = useState<string[]>([]);
  const [regionMode, setRegionMode] = useState<string>('all');

  const normalizeRegion = (rawValue: string) => {
    // Data-normalization pattern: map various region formats to one canonical code.
    const raw = (rawValue ?? '').trim();
    if (!raw) return 'Neznámy kraj';

    const upper = raw.toUpperCase();
    const lettersOnly = upper.replace(/[^A-Z]/g, '');
    const knownCodes = ['BA', 'TT', 'NR', 'TN', 'ZA', 'BB', 'PO', 'KE'];

    for (const code of knownCodes) {
      if (lettersOnly === code || lettersOnly.startsWith(code)) {
        return code;
      }
    }

    return raw;
  };

  const getStudentRegion = (student: StudentData) => {
    const value = student.Region ?? student.region ?? '';
    return normalizeRegion(value);
  };

  useEffect(() => {
    // Initial data hydration for all statistical calculations.
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      // Students snapshot -> typed model transform.
      const studentsSnap = await getDocs(collection(db, "students"));
      const studentsList: StudentData[] = studentsSnap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          name: data.name ?? "",
          surname: data.surname ?? "",
          mail: data.mail ?? "",
          school: data.school ?? "",
          region: data.region ?? data.Region ?? "",
          Region: data.Region ?? data.region ?? "",
          typeOfPayment: data.typeOfPayment ?? "",
          amount: typeof data.amount === "number" ? data.amount : Number(data.amount ?? 0),
          period: data.period ?? "",
        };
      });

      // Payments snapshot -> typed model transform.
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

      // Derive unique regions for regional breakdowns.
      const uniqueRegions = [...new Set(studentsList.map((s) => getStudentRegion(s)))];
      setRegions(uniqueRegions.sort());

      setStudents(studentsList);
      setPayments(paymentsList);
    } catch (err) {
      console.error("Chyba pri načítaní štatistík:", err);
    } finally {
      setLoading(false);
    }
  };

  // Aggregation function: paid/expected/difference/final for all or a subset of students.
  const calculateFinanceStats = (studentIds?: string[]): FinanceStats => {
    const relevantStudents = studentIds 
      ? students.filter(s => studentIds.includes(s.id))
      : students;

    // Paid: sum of all payments
    const paid = payments.reduce((acc, p) => {
      if (studentIds) {
        if (!p.matchedStudentId || !studentIds.includes(p.matchedStudentId)) {
          return acc;
        }
      }
      return acc + (p.amount || 0);
    }, 0);

    // Expected is time-dependent by academic month and period rules.
    // Logic: school year starts in September (month 9).
    // October: all, Nov-Dec-Jan: monthly only, Feb: monthly+half-year, Mar-Jul: monthly only.
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1; // 1-12
    
    // Determine current academic month (0 = September, 1 = October, ...)
    let academicMonth = currentMonth - 9;
    if (academicMonth <= 0) {
      academicMonth += 12; // ak sme pred septembrom, pridaj 12
    }

    let expected = 0;
    for (const student of relevantStudents) {
      const period = (student.period ?? "").toLowerCase();
      const monthlyAmount = student.amount || 0;

      if (period === "month" || period === "monthly") {
        // Monthly period is expected every month
        expected += monthlyAmount;
      } else if (period === "half-year" || period === "halfyear" || period === "half year") {
        // Half-year: February is the 5th academic month
        if (academicMonth === 5) {
          expected += monthlyAmount;
        }
      } else if (period === "year" || period === "yearly") {
        // Yearly: October is the 1st academic month
        if (academicMonth === 1) {
          expected += monthlyAmount;
        }
      }
    }

    // Final is full-year projection by periodicity type (1/2/10 installments).
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

  const normalizePeriod = (value?: string) => {
    const v = (value ?? '').toLowerCase().trim();
    if (v === 'year' || v === 'yearly') return 'year';
    if (v === 'half-year' || v === 'halfyear' || v === 'half year') return 'half-year';
    if (v === 'month' || v === 'monthly') return 'month';
    return 'other';
  };

  const getPeriodMultiplier = (period?: string) => {
    const normalized = normalizePeriod(period);
    if (normalized === 'year') return 1;
    if (normalized === 'half-year') return 2;
    if (normalized === 'month') return 10;
    return 0;
  };

  const getFullAmount = (student: StudentData) => {
    const baseAmount = typeof student.amount === 'number' ? student.amount : Number(student.amount ?? 0);
    const multiplier = getPeriodMultiplier(student.period);
    return baseAmount * multiplier;
  };

  const calculateStudentStats = (sourceStudents: StudentData[]) => {
    // Reduce pattern: compute multiple stats at once (periodicity, classic tiers, scholarship tiers).
    const periodStats = sourceStudents.reduce(
      (acc, student) => {
        const period = normalizePeriod(student.period);
        if (period === 'year') acc.year += 1;
        if (period === 'half-year') acc.halfYear += 1;
        if (period === 'month') acc.month += 1;
        return acc;
      },
      { year: 0, halfYear: 0, month: 0 }
    );

    const classicStats = sourceStudents.reduce(
      (acc, student) => {
        const fullAmount = getFullAmount(student);
        if (fullAmount === 400) acc.amount400 += 1;
        if (fullAmount === 360) acc.amount360 += 1;
        return acc;
      },
      { amount400: 0, amount360: 0 }
    );

    const classicTotal = classicStats.amount400 + classicStats.amount360;

    const scholarshipAmountMap = sourceStudents.reduce((acc, student) => {
      const fullAmount = getFullAmount(student);
      if (fullAmount <= 0) return acc;
      if (fullAmount === 400 || fullAmount === 360) return acc;

      acc.set(fullAmount, (acc.get(fullAmount) ?? 0) + 1);
      return acc;
    }, new Map<number, number>());

    const scholarshipRows = Array.from(scholarshipAmountMap.entries()).sort((a, b) => b[0] - a[0]);
    const scholarshipTotal = scholarshipRows.reduce((sum, [, count]) => sum + count, 0);

    return {
      periodStats,
      classicStats,
      classicTotal,
      scholarshipRows,
      scholarshipTotal,
    };
  };

  const studentsStats = calculateStudentStats(students);

  if (loading) {
    return <div className="statistics-container">Načítavam štatistiky...</div>;
  }

  const overallStats = calculateFinanceStats();
  const totalStudents = students.length;
  const totalPayments = payments.length;
  const visibleRegions = regionMode === 'all'
    ? regions
    : regions.filter((region) => region === regionMode);

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
        <button
          className={`statistics-tab-btn ${
            tab === 'students'
              ? 'active'
              : ''
          }`}
          onClick={() => setTab('students')}
        >
          Študenti
        </button>
      </div>

      {/* TAB: OVERVIEW */}
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
          {/* Table with all statistics */}
          <div className="finance-table-section">
            <div className="statistics-card-header">
              <h3>Finančný prehľad - Celkom</h3>
              <p>Zaplatené do obdobia vs. Očakavané do obdobia hodnoty</p>
            </div>
            <div className="finance-table-wrapper">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Zaplatené do obdobia </th>
                    <th>Očakavané do obdobia </th>
                    <th>Rozdiel </th>
                    <th>Celkovo </th>
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

          {/* Cards by regions */}
          <div className="regions-section">
            <div className="region-modes">
              <button
                className={`region-mode-btn ${regionMode === 'all' ? 'active' : ''}`}
                onClick={() => setRegionMode('all')}
              >
                Všetky regióny
              </button>
              {regions.map((region) => (
                <button
                  key={region}
                  className={`region-mode-btn ${regionMode === region ? 'active' : ''}`}
                  onClick={() => setRegionMode(region)}
                >
                  {region}
                </button>
              ))}
            </div>
            <div className="regions-grid">
              {visibleRegions.map((region) => {
                const regionStudents = students
                  .filter((s) => getStudentRegion(s) === region)
                  .map(s => s.id);
                const regionStats = calculateFinanceStats(regionStudents);

                return (
                  <div key={region} className="region-card">
                    <div className="statistics-card-header">
                      <h4>{region}</h4>
                      <p>Regionálne info</p>
                    </div>
                    <div className="region-stats">
                      <div className="region-stat-row">
                        <span className="stat-label">Zaplatené do obdobia:</span>
                        <span className="stat-number">{regionStats.paid.toFixed(2)} €</span>
                      </div>
                      <div className="region-stat-row">
                        <span className="stat-label">Očakavané do obdobia:</span>
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

      {/* TAB: STUDENTS */}
      {tab === 'students' && (
        <div className="statistics-tab-content">
          <div className="finance-table-section">
            <div className="statistics-card-header">
              <h3>Period</h3>
              <p>Počet študentov podľa typu obdobia platieb</p>
            </div>
            <div className="finance-table-wrapper">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Half-year</th>
                    <th>Month</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{studentsStats.periodStats.year}</td>
                    <td>{studentsStats.periodStats.halfYear}</td>
                    <td>{studentsStats.periodStats.month}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="finance-table-section" style={{ marginTop: 20 }}>
            <div className="statistics-card-header">
              <h3>Suma: Classic</h3>
              <p>Klasicky platiaci študenti. Spolu platiacich: {studentsStats.classicTotal}</p>
            </div>
            <div className="finance-table-wrapper">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>PLNÁ SUMA</th>
                    <th>Počet študentov</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>400 €</td>
                    <td>{studentsStats.classicStats.amount400}</td>
                  </tr>
                  <tr>
                    <td>360 €</td>
                    <td>{studentsStats.classicStats.amount360}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="finance-table-section" style={{ marginTop: 20 }}>
            <div className="statistics-card-header">
              <h3>Suma: Scholarship</h3>
              <p> Študenti so štipendium. Spolu platiacich: {studentsStats.scholarshipTotal}</p>
            </div>
            <div className="finance-table-wrapper">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Plná suma</th>
                    <th>Počet študentov</th>
                  </tr>
                </thead>
                <tbody>
                  {studentsStats.scholarshipRows.map(([fullAmount, count]) => (
                    <tr key={fullAmount}>
                      <td>{fullAmount.toFixed(2)} €</td>
                      <td>{count}</td>
                    </tr>
                  ))}
                  {studentsStats.scholarshipRows.length === 0 && (
                    <tr>
                      <td colSpan={2}>Žiadne hodnoty</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="regions-section" style={{ marginTop: 20 }}>
            <div className="region-modes">
              <button
                className={`region-mode-btn ${regionMode === 'all' ? 'active' : ''}`}
                onClick={() => setRegionMode('all')}
              >
                Všetky regióny
              </button>
              {regions.map((region) => (
                <button
                  key={`students-mode-${region}`}
                  className={`region-mode-btn ${regionMode === region ? 'active' : ''}`}
                  onClick={() => setRegionMode(region)}
                >
                  {region}
                </button>
              ))}
            </div>

            <div className="regions-grid">
              {visibleRegions.map((region) => {
                const regionStudentsData = students.filter((s) => getStudentRegion(s) === region);
                const regionStudentStats = calculateStudentStats(regionStudentsData);

                return (
                  <div key={`students-${region}`} className="region-card">
                    <div className="statistics-card-header">
                      <h4>{region}</h4>
                      <p>Regionálne info</p>
                    </div>
                    <div className="region-stats">
                      <div className="region-stat-row">
                        <span className="stat-label">Year:</span>
                        <span className="stat-number">{regionStudentStats.periodStats.year}</span>
                      </div>
                      <div className="region-stat-row">
                        <span className="stat-label">Half-year:</span>
                        <span className="stat-number">{regionStudentStats.periodStats.halfYear}</span>
                      </div>
                      <div className="region-stat-row">
                        <span className="stat-label">Month:</span>
                        <span className="stat-number">{regionStudentStats.periodStats.month}</span>
                      </div>

                      <div className="region-group-divider" />

                      <div className="region-stat-row">
                        <span className="stat-label">Classic spolu:</span>
                        <span className="stat-number">{regionStudentStats.classicTotal}</span>
                      </div>
                      <div className="region-stat-row">
                        <span className="stat-label">Classic 400:</span>
                        <span className="stat-number">{regionStudentStats.classicStats.amount400}</span>
                      </div>
                      <div className="region-stat-row">
                        <span className="stat-label">Classic 360:</span>
                        <span className="stat-number">{regionStudentStats.classicStats.amount360}</span>
                      </div>

                      <div className="region-group-divider" />

                      <div className="region-stat-row">
                        <span className="stat-label">Scholarship spolu:</span>
                        <span className="stat-number">{regionStudentStats.scholarshipTotal}</span>
                      </div>
                      {regionStudentStats.scholarshipRows.map(([fullAmount, count]) => (
                        <div className="region-stat-row" key={`${region}-sch-${fullAmount}`}>
                          <span className="stat-label">Scholarship {fullAmount.toFixed(2)} €:</span>
                          <span className="stat-number">{count}</span>
                        </div>
                      ))}
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
