import { useEffect, useRef, useState } from 'react'

const API = 'http://192.168.2.43:8081'
const KASE = ['AVANS', 'PAZAR']

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function fmt(n) {
  return Number(n).toLocaleString('sr-RS', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function parseError(data) {
  if (!data) return 'Greška'
  if (typeof data.detail === 'string') return data.detail
  if (Array.isArray(data.detail)) {
    return data.detail
      .map((d) => (d.msg || '').replace(/^Value error,\s*/, ''))
      .filter(Boolean)
      .join('; ') || 'Greška'
  }
  return 'Greška'
}

function fmtDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function prevDayDate(iso) {
  const d = new Date(iso)
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

function hasBothAmounts(ulaz, izlaz) {
  return Number(ulaz || 0) > 0 && Number(izlaz || 0) > 0
}

export default function App() {
  const [kasa, setKasa] = useState('AVANS')
  const [datum, setDatum] = useState(todayISO())
  const [journal, setJournal] = useState(null)
  const [opis, setOpis] = useState('')
  const [ulaz, setUlaz] = useState('')
  const [racun, setRacun] = useState('')
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [edit, setEdit] = useState({ opis: '', ulaz: '', izlaz: '', racun_broj: '' })
  const [printMenuOpen, setPrintMenuOpen] = useState(false)
  const printMenuRef = useRef(null)
  const [uplataOpen, setUplataOpen] = useState(false)
  const [uplataAmount, setUplataAmount] = useState('')
  const [rangeOpen, setRangeOpen] = useState(false)
  const [rangeFrom, setRangeFrom] = useState(todayISO())
  const [rangeTo, setRangeTo] = useState(todayISO())
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchKasa, setSearchKasa] = useState('')
  const [searchFrom, setSearchFrom] = useState('')
  const [searchTo, setSearchTo] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchDone, setSearchDone] = useState(false)

  async function loadJournal() {
    setError('')
    try {
      const r = await fetch(`${API}/journal/${kasa}/${datum}`)
      if (!r.ok) throw new Error('Greška pri učitavanju')
      setJournal(await r.json())
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => {
    loadJournal()
  }, [kasa, datum])

  useEffect(() => {
    function onClick(e) {
      if (printMenuRef.current && !printMenuRef.current.contains(e.target)) {
        setPrintMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function doPrint(mode) {
    setPrintMenuOpen(false)
    document.body.classList.remove('print-modern', 'print-classic')
    document.body.classList.add(`print-${mode}`)
    setTimeout(() => {
      window.print()
      setTimeout(() => {
        document.body.classList.remove('print-modern', 'print-classic')
      }, 200)
    }, 50)
  }

  async function addEntry(e) {
    e.preventDefault()
    setError('')
    if (hasBothAmounts(ulaz, 0)) {
      setError('Stavka ne može imati i ulaz i izlaz')
      return
    }
    const r = await fetch(`${API}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kasa,
        datum,
        opis,
        ulaz: ulaz || '0',
        izlaz: '0',
        racun_broj: racun,
      }),
    })
    if (!r.ok) {
      setError(parseError(await r.json()))
      return
    }
    setOpis('')
    setUlaz('')
    setRacun('')
    loadJournal()
  }

  function startEdit(e) {
    setEditingId(e.id)
    setEdit({
      opis: e.opis,
      ulaz: e.ulaz,
      izlaz: e.izlaz,
      racun_broj: e.racun_broj,
    })
  }

  async function saveEdit(e) {
    setError('')
    if (hasBothAmounts(edit.ulaz, edit.izlaz)) {
      setError('Stavka ne može imati i ulaz i izlaz')
      return
    }
    const r = await fetch(`${API}/entries/${e.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kasa: e.kasa,
        datum: e.datum,
        opis: edit.opis,
        ulaz: edit.ulaz || '0',
        izlaz: edit.izlaz || '0',
        racun_broj: edit.racun_broj,
      }),
    })
    if (!r.ok) {
      setError(parseError(await r.json()))
      return
    }
    setEditingId(null)
    loadJournal()
  }

  async function submitUplata(e) {
    e.preventDefault()
    setError('')
    const r = await fetch(`${API}/uplata-pazara`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kasa: 'AVANS',
        datum,
        opis: 'uplata pazara',
        ulaz: '0',
        izlaz: uplataAmount,
        racun_broj: fmtDate(datum),
      }),
    })
    if (!r.ok) {
      setError(parseError(await r.json()))
      return
    }
    setUplataOpen(false)
    setUplataAmount('')
    loadJournal()
  }

  async function removeEntry(id) {
    if (!confirm('Obrisati stavku?')) return
    await fetch(`${API}/entries/${id}`, { method: 'DELETE' })
    loadJournal()
  }

  async function searchEntries(e) {
    e.preventDefault()
    setError('')
    if (searchFrom && searchTo && searchTo < searchFrom) {
      setError("Datum 'do' mora biti posle datuma 'od'")
      return
    }

    const params = new URLSearchParams()
    if (searchQuery.trim()) params.set('q', searchQuery.trim())
    if (searchKasa) params.set('kasa', searchKasa)
    if (searchFrom) params.set('start', searchFrom)
    if (searchTo) params.set('end', searchTo)

    const r = await fetch(`${API}/entries/search?${params}`)
    if (!r.ok) {
      setError(parseError(await r.json()))
      return
    }
    setSearchResults(await r.json())
    setSearchDone(true)
  }

  function openSearchResult(entry) {
    setKasa(entry.kasa)
    setDatum(entry.datum)
    setSearchOpen(false)
  }

  const firma =
    kasa === 'AVANS' ? 'AVANSI Joviste, Subotica' : 'Joviste PAZAR, Subotica'

  return (
    <>
      <div className="app modern-view">
        <div className="header">
          <div>
            <h1 className="title">Dnevnik blagajne</h1>
            <div className="subtitle">
              {firma} · {fmtDate(datum)}
            </div>
          </div>
          <div className="toolbar-spacer no-print">
            <div className="print-wrap" ref={printMenuRef}>
              <button
                className="btn"
                onClick={() => setPrintMenuOpen((v) => !v)}
              >
                Štampaj ▾
              </button>
              {printMenuOpen && (
                <div className="print-menu">
                  <button
                    className="print-menu-item"
                    onClick={() => doPrint('modern')}
                  >
                    <div className="pmi-title">Moderni izgled</div>
                    <div className="pmi-sub">Kao na ekranu</div>
                  </button>
                  <button
                    className="print-menu-item"
                    onClick={() => doPrint('classic')}
                  >
                    <div className="pmi-title">Papirni obrazac</div>
                    <div className="pmi-sub">Kao stari dnevnik</div>
                  </button>
                  <button
                    className="print-menu-item"
                    onClick={() => {
                      setPrintMenuOpen(false)
                      setRangeFrom(datum)
                      setRangeTo(datum)
                      setRangeOpen(true)
                    }}
                  >
                    <div className="pmi-title">Opseg datuma…</div>
                    <div className="pmi-sub">PDF za više dana</div>
                  </button>
                </div>
              )}
            </div>
            <a
              className="btn"
              href={`${API}/journal/${kasa}/${datum}/pdf`}
              target="_blank"
              rel="noreferrer"
            >
              PDF
            </a>
          </div>
        </div>

        <div className="card no-print">
          <div className="toolbar">
            <div className="tabs">
              {KASE.map((k) => (
                <button
                  key={k}
                  className={`tab ${k === kasa ? 'active' : ''}`}
                  onClick={() => setKasa(k)}
                >
                  {k}
                </button>
              ))}
            </div>
            <input
              type="date"
              className="date-input"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
            />
            <button
              type="button"
              className="btn"
              onClick={() => setUplataOpen(true)}
              style={{ marginLeft: 'auto' }}
            >
              + Uplata pazara
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setSearchOpen((v) => !v)}
            >
              Pretraga
            </button>
          </div>

          <form className="form-row" onSubmit={addEntry}>
            <input
              className="input"
              placeholder="Ime i prezime"
              value={opis}
              onChange={(e) => setOpis(e.target.value)}
              required
            />
            <input
              className="input num"
              placeholder="Ulaz (RSD)"
              type="number"
              step="0.01"
              min="0"
              value={ulaz}
              onChange={(e) => setUlaz(e.target.value)}
              required
            />
            <input
              className="input"
              placeholder={kasa === 'AVANS' ? 'a0506-26' : 'r0675-26'}
              value={racun}
              onChange={(e) => setRacun(e.target.value)}
              pattern={kasa === 'AVANS' ? '^[aA].*' : '^[rR].*'}
              title={
                kasa === 'AVANS'
                  ? 'Račun broj za AVANS mora počinjati sa "a"'
                  : 'Račun broj za PAZAR mora počinjati sa "r"'
              }
              required
            />
            <button type="submit" className="btn btn-primary">
              Dodaj
            </button>
          </form>

          {error && <div className="error">{error}</div>}
        </div>

        {searchOpen && (
          <div className="card no-print search-card">
            <form className="search-form" onSubmit={searchEntries}>
              <input
                className="input"
                placeholder="Račun broj ili ime"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <select
                className="input"
                value={searchKasa}
                onChange={(e) => setSearchKasa(e.target.value)}
              >
                <option value="">Sve kase</option>
                {KASE.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <input
                className="date-input"
                type="date"
                value={searchFrom}
                onChange={(e) => setSearchFrom(e.target.value)}
              />
              <input
                className="date-input"
                type="date"
                value={searchTo}
                onChange={(e) => setSearchTo(e.target.value)}
              />
              <button type="submit" className="btn btn-primary">
                Nađi
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setSearchQuery('')
                  setSearchKasa('')
                  setSearchFrom('')
                  setSearchTo('')
                  setSearchResults([])
                  setSearchDone(false)
                }}
              >
                Očisti
              </button>
            </form>

            {searchDone && (
              <div className="table-wrap">
                <table className="table compact-table">
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Kasa</th>
                      <th>Opis</th>
                      <th className="num">Ulaz</th>
                      <th className="num">Izlaz</th>
                      <th>Račun broj</th>
                      <th style={{ width: 90 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.length === 0 && (
                      <tr>
                        <td colSpan={7} className="empty">
                          Nema rezultata
                        </td>
                      </tr>
                    )}
                    {searchResults.map((entry) => (
                      <tr key={entry.id}>
                        <td>{fmtDate(entry.datum)}</td>
                        <td>{entry.kasa}</td>
                        <td>{entry.opis}</td>
                        <td className="num">
                          {Number(entry.ulaz) ? fmt(entry.ulaz) : ''}
                        </td>
                        <td className="num">
                          {Number(entry.izlaz) ? fmt(entry.izlaz) : ''}
                        </td>
                        <td className="muted">{entry.racun_broj}</td>
                        <td className="row-actions">
                          <button
                            type="button"
                            className="btn btn-icon btn-ghost"
                            onClick={() => openSearchResult(entry)}
                          >
                            Otvori
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="card" style={{ marginTop: 16 }}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>Rb</th>
                  <th>Opis</th>
                  <th className="num">Ulaz</th>
                  <th className="num">Izlaz</th>
                  <th>Račun broj</th>
                  <th className="no-print" style={{ width: 120 }}></th>
                </tr>
              </thead>
              <tbody>
                {journal && journal.entries.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty">
                      Nema stavki za ovaj dan
                    </td>
                  </tr>
                )}
                {journal &&
                  journal.entries.map((e, i) => {
                    const isEditing = editingId === e.id
                    return (
                      <tr key={e.id}>
                        <td className="muted">{i + 1}</td>
                        <td>
                          {isEditing ? (
                            <input
                              className="input-edit"
                              value={edit.opis}
                              onChange={(ev) =>
                                setEdit({ ...edit, opis: ev.target.value })
                              }
                            />
                          ) : (
                            e.opis
                          )}
                        </td>
                        <td className="num">
                          {isEditing ? (
                            <input
                              className="input-edit num"
                              type="number"
                              step="0.01"
                              min="0"
                              value={edit.ulaz}
                              onChange={(ev) =>
                                setEdit({ ...edit, ulaz: ev.target.value })
                              }
                            />
                          ) : Number(e.ulaz) ? (
                            fmt(e.ulaz)
                          ) : (
                            ''
                          )}
                        </td>
                        <td className="num">
                          {isEditing ? (
                            <input
                              className="input-edit num"
                              type="number"
                              step="0.01"
                              min="0"
                              value={edit.izlaz}
                              onChange={(ev) =>
                                setEdit({ ...edit, izlaz: ev.target.value })
                              }
                            />
                          ) : Number(e.izlaz) ? (
                            fmt(e.izlaz)
                          ) : (
                            ''
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              className="input-edit"
                              value={edit.racun_broj}
                              onChange={(ev) =>
                                setEdit({ ...edit, racun_broj: ev.target.value })
                              }
                            />
                          ) : (
                            <span className="muted">{e.racun_broj}</span>
                          )}
                        </td>
                        <td className="row-actions no-print">
                          <div className="action-group">
                            {isEditing ? (
                              <>
                                <button
                                  className="btn btn-icon btn-primary"
                                  onClick={() => saveEdit(e)}
                                >
                                  Sačuvaj
                                </button>
                                <button
                                  className="btn btn-icon btn-ghost"
                                  onClick={() => setEditingId(null)}
                                >
                                  Otkaži
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  className="btn btn-icon btn-ghost"
                                  onClick={() => startEdit(e)}
                                >
                                  Izmeni
                                </button>
                                <button
                                  className="btn btn-icon btn-danger-ghost"
                                  onClick={() => removeEntry(e.id)}
                                >
                                  Obriši
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                {journal && journal.entries.length > 0 && (
                  <tr className="totals-row">
                    <td colSpan={2}>PROMET BLAGAJNE</td>
                    <td className="num">{fmt(journal.ukupno_ulaz)}</td>
                    <td className="num">{fmt(journal.ukupno_izlaz)}</td>
                    <td colSpan={2} className="no-print"></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {journal && (
          <div className="summary">
            <Stat label="Prethodni saldo" value={fmt(journal.prethodni_saldo)} />
            <Stat label="Ukupno primljeno" value={fmt(journal.ukupno_ulaz)} />
            <Stat label="Odbija se izdatak" value={fmt(journal.ukupno_izlaz)} />
            <Stat
              label={`Saldo ${fmtDate(journal.datum)}`}
              value={fmt(journal.saldo)}
              accent
              negative={Number(journal.saldo) < 0}
            />
          </div>
        )}
      </div>

      {journal && <ClassicView journal={journal} firma={firma} />}

      {rangeOpen && (
        <div
          className="modal-backdrop no-print"
          onClick={() => setRangeOpen(false)}
        >
          <form
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(ev) => {
              ev.preventDefault()
              if (rangeTo < rangeFrom) {
                setError("Datum 'do' mora biti posle datuma 'od'")
                return
              }
              const url = `${API}/journal/${kasa}/range/pdf?start=${rangeFrom}&end=${rangeTo}&skip_empty=false`
              window.open(url, '_blank')
              setRangeOpen(false)
            }}
          >
            <div className="modal-title">PDF za opseg datuma</div>
            <div className="modal-sub">Kasa: {kasa}</div>
            <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
              <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                <span style={{ color: 'var(--text-muted)' }}>Od datuma</span>
                <input
                  className="date-input"
                  type="date"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  required
                />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>
                <span style={{ color: 'var(--text-muted)' }}>Do datuma</span>
                <input
                  className="date-input"
                  type="date"
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                  required
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setRangeOpen(false)}
              >
                Otkaži
              </button>
              <button type="submit" className="btn btn-primary">
                Otvori PDF
              </button>
            </div>
          </form>
        </div>
      )}

      {uplataOpen && (
        <div
          className="modal-backdrop no-print"
          onClick={() => setUplataOpen(false)}
        >
          <form
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitUplata}
          >
            <div className="modal-title">Uplata pazara</div>
            <div className="modal-sub">Datum: {fmtDate(datum)}</div>
            <input
              className="input num"
              type="number"
              step="0.01"
              min="0"
              placeholder="Iznos (RSD)"
              value={uplataAmount}
              onChange={(e) => setUplataAmount(e.target.value)}
              required
              autoFocus
              style={{ width: '100%', marginTop: 12 }}
            />
            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setUplataOpen(false)
                  setUplataAmount('')
                }}
              >
                Otkaži
              </button>
              <button type="submit" className="btn btn-primary">
                Sačuvaj
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

function Stat({ label, value, accent, negative }) {
  const cls = ['stat', accent && 'accent', negative && 'negative']
    .filter(Boolean)
    .join(' ')
  return (
    <div className={cls}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  )
}

function ClassicView({ journal, firma }) {
  const prev = fmtDate(prevDayDate(journal.datum))
  return (
    <div className="classic-view">
      <h1 className="cv-title">DNEVNIK BLAGAJNE</h1>
      <div className="cv-meta">
        <div>
          <strong>Datum:</strong> {fmtDate(journal.datum)}
        </div>
        <div>
          <strong>Firma:</strong> {firma}
        </div>
      </div>

      <table className="cv-table">
        <thead>
          <tr>
            <th style={{ width: '8%' }}>Rb.</th>
            <th>Opis</th>
            <th style={{ width: '15%' }} className="num">Ulaz</th>
            <th style={{ width: '15%' }} className="num">Izlaz</th>
            <th style={{ width: '18%' }}>Racun broj</th>
          </tr>
        </thead>
        <tbody>
          {journal.entries.map((e, i) => (
            <tr key={e.id}>
              <td>{i + 1}</td>
              <td>{e.opis}</td>
              <td className="num">{Number(e.ulaz) ? fmt(e.ulaz) : ''}</td>
              <td className="num">{Number(e.izlaz) ? fmt(e.izlaz) : ''}</td>
              <td>{e.racun_broj}</td>
            </tr>
          ))}
          <tr className="cv-total">
            <td></td>
            <td><strong>PROMET BLAGAJNE:</strong></td>
            <td className="num"><strong>{fmt(journal.ukupno_ulaz)}</strong></td>
            <td className="num"><strong>{fmt(journal.ukupno_izlaz)}</strong></td>
            <td></td>
          </tr>
        </tbody>
      </table>

      <table className="cv-summary">
        <tbody>
          <tr>
            <td>Prethodni saldo ({prev}):</td>
            <td className="num">{fmt(journal.prethodni_saldo)}</td>
          </tr>
          <tr>
            <td>Ukupno primljeno:</td>
            <td className="num">{fmt(journal.ukupno_ulaz)}</td>
          </tr>
          <tr>
            <td>Odbija se izdatak:</td>
            <td className="num">{fmt(journal.ukupno_izlaz)}</td>
          </tr>
          <tr>
            <td>Saldo od {fmtDate(journal.datum)}:</td>
            <td className="num">{fmt(journal.saldo)}</td>
          </tr>
        </tbody>
      </table>

      <div className="cv-signatures">
        <div className="cv-sig"><span>Blagajnik</span></div>
        <div className="cv-sig"><span>Kontrolisao</span></div>
        <div className="cv-sig"><span>Broj priloga</span></div>
      </div>
    </div>
  )
}
