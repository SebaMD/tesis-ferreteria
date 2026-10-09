# Frontend de Ferretería FYF

Interfaz React con Vite y Tailwind CSS. La instalación y configuración general se describen en el [README principal](../README.md).

Desde este directorio:

```sh
npm ci
npm run dev
```

El proxy de desarrollo envía `/api` y `/uploads` a `http://localhost:3000`. `VITE_API_URL` permite utilizar un backend en otro origen; consultar [.env.example](.env.example). Esta variable es pública y se incorpora al compilar, no al iniciar Nginx.

```sh
npm run lint
npm run build
```

El Dockerfile incluye las etapas `development`, `build` y `production`; Compose utiliza la última, que sirve los archivos mediante Nginx y conserva la navegación de la SPA.
