import React from 'react';
import { createRoot } from 'react-dom/client';
import AuthApp from './auth/AuthApp.jsx';
import './styles.css';

class AppErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('WasteWise could not render the current page.', error);
  }

  render() {
    if (this.state.hasError) {
      return <main className="app-error-screen" role="alert"><div className="app-error-card"><span className="app-error-mark">!</span><h1>WasteWise couldn’t open this page</h1><p>Your workspace data is safe. Reload the app to try again.</p><button className="action-button" type="button" onClick={() => window.location.reload()}>Reload WasteWise</button></div></main>;
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(<React.StrictMode><AppErrorBoundary><AuthApp/></AppErrorBoundary></React.StrictMode>);
