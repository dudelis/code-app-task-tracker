import { useEffect, useState } from 'react'
import './App.css'
import { Csa_customersService } from './generated/services/Csa_customersService'
import { fetchActiveCustomers, type Customer } from './data/customers'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; customers: Customer[] }

function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetchActiveCustomers((options) => Csa_customersService.getAll(options))
      .then((customers) => {
        if (!cancelled) setState({ status: 'ready', customers })
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Failed to load customers.',
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="app">
      <h1>Task Tracker</h1>
      <section>
        <h2>Active customers</h2>
        {state.status === 'loading' && <p>Loading customers…</p>}
        {state.status === 'error' && <p role="alert">Could not load customers: {state.message}</p>}
        {state.status === 'ready' && state.customers.length === 0 && <p>No active customers yet.</p>}
        {state.status === 'ready' && state.customers.length > 0 && (
          <ul className="customer-list">
            {state.customers.map((customer) => (
              <li key={customer.id}>{customer.name}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

export default App
