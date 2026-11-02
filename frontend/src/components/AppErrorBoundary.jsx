import { Component } from "react";

export default class AppErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main role="alert" className="mx-auto grid max-w-2xl gap-4 p-6 text-ink-950">
      <h1 className="text-xl font-bold">No se pudo abrir esta pantalla</h1>
      <p>La pantalla encontró un error. Recarga la página; si ya habías enviado una operación, consulta su resultado antes de repetirla.</p>
      <p>Si el navegador no dispone de funciones seguras, actualízalo o utiliza HTTPS.</p>
      <button type="button" onClick={() => window.location.reload()}>Recargar página</button>
    </main>;
  }
}
