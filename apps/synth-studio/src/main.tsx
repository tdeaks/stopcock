import { render } from 'solid-js/web'
import { App } from './components/App'
import './style.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root mount point')

render(() => <App />, root)
