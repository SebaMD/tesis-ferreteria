import { Pencil, Search, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getApiError } from "../api/httpClient.js";
import AppModal from "../components/AppModal.jsx";
import Pagination from "../components/Pagination.jsx";
import { compareByNewest, formatDate } from "../helpers/formatters.js";
import { ROLE_NAMES } from "../helpers/roles.js";
import {
  alertClasses,
  badgeClass,
  codeCellClass,
  emptyTableCellClass,
  formActionsClass,
  pageClass,
  pageHeaderClass,
  secondaryButtonClass,
  tableHeadingClass,
  tablePanelClass,
} from "../helpers/uiClasses.js";
import usePagination from "../hooks/usePagination.js";
import { createUserRequest, getUsersRequest, updateUserRequest } from "../services/users.service.js";

const ROLE_ORDER = ["ADMIN", "MANAGER", "CASHIER", "WAREHOUSE"];
const ROLE_FALLBACK_IDS = {
  ADMIN: 1,
  MANAGER: 2,
  CASHIER: 3,
  WAREHOUSE: 4,
};
const USER_DATE_OPTIONS = {
  day: "2-digit",
  month: "short",
  year: "numeric",
};
const emptyForm = {
  rut: "",
  names: "",
  surnames: "",
  correo: "",
  password: "",
  phone: "",
  roleName: "CASHIER",
  status: "ACTIVE",
};

function getRoleOptions(users) {
  const roleIdByName = new Map(users.map((user) => [user.roleName, user.roleId]));

  return ROLE_ORDER.map((roleName) => ({
    id: roleIdByName.get(roleName) ?? ROLE_FALLBACK_IDS[roleName],
    name: roleName,
    label: ROLE_NAMES[roleName] || roleName,
  }));
}

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [activeForm, setActiveForm] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const roleOptions = useMemo(() => getRoleOptions(users), [users]);
  const normalizedSearch = search.trim().toLocaleLowerCase("es");
  const filteredUsers = useMemo(
    () => users.filter((user) => {
      if (!normalizedSearch) return true;

      const searchableValues = [
        user.id,
        user.rut,
        user.names,
        user.surnames,
        user.correo,
        user.phone,
        user.roleName,
        ROLE_NAMES[user.roleName],
        user.status,
      ];

      return searchableValues.some((value) => String(value || "").toLocaleLowerCase("es").includes(normalizedSearch));
    }).sort(compareByNewest),
    [normalizedSearch, users],
  );
  const usersPagination = usePagination(filteredUsers, {
    resetKey: `${normalizedSearch}|${users.length}`,
  });
  const isEditing = Boolean(editingUserId);

  const loadUsers = async () => {
    const data = await getUsersRequest();
    setUsers(data);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadUsers().catch((err) => setError(getApiError(err, "No se pudieron cargar usuarios")));
  }, []);

  const openCreateForm = () => {
    setForm(emptyForm);
    setEditingUserId(null);
    setActiveForm(true);
    setError("");
    setMessage("");
  };

  const startEditing = (user) => {
    setForm({
      rut: user.rut || "",
      names: user.names || "",
      surnames: user.surnames || "",
      correo: user.correo || "",
      password: "",
      phone: user.phone || "",
      roleName: user.roleName || "CASHIER",
      status: user.status || "ACTIVE",
    });
    setEditingUserId(user.id);
    setActiveForm(true);
    setError("");
    setMessage("");
  };

  const closeForm = () => {
    if (submitting) return;
    setForm(emptyForm);
    setEditingUserId(null);
    setActiveForm(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    const selectedRole = roleOptions.find((role) => role.name === form.roleName);

    if (!selectedRole?.id) {
      setError("No se pudo determinar el rol seleccionado");
      return;
    }

    const payload = {
      roleId: Number(selectedRole.id),
      rut: form.rut,
      names: form.names,
      surnames: form.surnames,
      correo: form.correo,
      phone: form.phone.trim() || null,
      status: form.status,
    };

    if (!isEditing || form.password.trim()) {
      payload.password = form.password;
    }

    try {
      setSubmitting(true);
      if (isEditing) {
        await updateUserRequest(editingUserId, payload);
      } else {
        await createUserRequest(payload);
      }
      setMessage(isEditing ? "Usuario actualizado exitosamente" : "Usuario creado exitosamente");
      closeForm();
      await loadUsers();
    } catch (err) {
      setError(getApiError(err, "No se pudo guardar el usuario"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className={pageClass}>
      <div className={pageHeaderClass}>
        <div>
          <h1>Usuarios</h1>
          <p>Creación y edición de usuarios internos del sistema.</p>
        </div>
        <button type="button" onClick={openCreateForm}>
          <UserPlus size={18} />
          Nuevo usuario
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3.5 max-[720px]:items-stretch">
        <label className="relative block w-full max-w-110 max-[720px]:max-w-none">
          <Search className="absolute top-1/2 left-3 z-1 -translate-y-1/2 text-slate-500" size={17} />
          <input
            className="pl-9.75"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre, correo, RUT o rol"
            aria-label="Buscar usuarios"
          />
        </label>
        <span className="text-xs font-semibold text-slate-500">
          {filteredUsers.length} de {users.length} usuarios
        </span>
      </div>

      {message && <div className={alertClasses.success}>{message}</div>}
      {error && !activeForm && <div className={alertClasses.error}>{error}</div>}

      <AppModal
        open={activeForm}
        title={isEditing ? "Editar usuario" : "Nuevo usuario"}
        description="Los usuarios internos son creados únicamente por el Administrador."
        onClose={closeForm}
        size="large"
      >
        <form className="grid gap-3.75" onSubmit={handleSubmit}>
          {error && <div className={alertClasses.error}>{error}</div>}
          <div className="grid grid-cols-2 gap-3 max-[720px]:grid-cols-1">
            <label>
              Nombres
              <input value={form.names} onChange={(event) => setForm((current) => ({ ...current, names: event.target.value }))} required />
            </label>
            <label>
              Apellidos
              <input value={form.surnames} onChange={(event) => setForm((current) => ({ ...current, surnames: event.target.value }))} required />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 max-[720px]:grid-cols-1">
            <label>
              RUT
              <input
                value={form.rut}
                onChange={(event) => setForm((current) => ({ ...current, rut: event.target.value }))}
                placeholder="12345678-9"
                required
              />
            </label>
            <label>
              Correo
              <input
                type="email"
                value={form.correo}
                onChange={(event) => setForm((current) => ({ ...current, correo: event.target.value }))}
                required
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 max-[720px]:grid-cols-1">
            <label>
              Contraseña {isEditing && <span className="text-[11px] text-slate-500">opcional</span>}
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                placeholder={isEditing ? "Dejar vacío para mantener" : "Ej: Usuario123."}
                required={!isEditing}
              />
            </label>
            <label>
              Teléfono
              <input
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                placeholder="+56 9 1234 5678"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 max-[720px]:grid-cols-1">
            <label>
              Rol
              <select value={form.roleName} onChange={(event) => setForm((current) => ({ ...current, roleName: event.target.value }))}>
                {roleOptions.map((role) => (
                  <option key={role.name} value={role.name}>{role.label}</option>
                ))}
              </select>
            </label>
            <label>
              Estado
              <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}>
                <option value="ACTIVE">Activo</option>
                <option value="INACTIVE">Inactivo</option>
              </select>
            </label>
          </div>
          <div className={formActionsClass}>
            <button className={secondaryButtonClass} type="button" onClick={closeForm} disabled={submitting}>Cancelar</button>
            <button type="submit" disabled={submitting}>{isEditing ? "Actualizar usuario" : "Guardar usuario"}</button>
          </div>
        </form>
      </AppModal>

      <div className={tablePanelClass}>
        <div className={tableHeadingClass}>
          <div>
            <h2>Usuarios registrados</h2>
            <p>No se muestran contraseñas ni hashes.</p>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Usuario</th>
              <th>RUT</th>
              <th>Correo</th>
              <th>Teléfono</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Creado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usersPagination.paginatedItems.map((user) => (
              <tr key={user.id}>
                <td className={codeCellClass}>#{user.id}</td>
                <td>{user.names} {user.surnames}</td>
                <td>{user.rut}</td>
                <td>{user.correo}</td>
                <td>{user.phone || "-"}</td>
                <td>{ROLE_NAMES[user.roleName] || user.roleName}</td>
                <td>
                  <span className={badgeClass(user.status === "ACTIVE" ? "success" : "neutral")}>
                    {user.status === "ACTIVE" ? "Activo" : "Inactivo"}
                  </span>
                </td>
                <td>{formatDate(user.createdAt, USER_DATE_OPTIONS, "-")}</td>
                <td>
                  <button className={secondaryButtonClass} type="button" onClick={() => startEditing(user)}>
                    <Pencil size={17} />
                    Editar
                  </button>
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 && (
              <tr>
                <td className={emptyTableCellClass} colSpan="9">
                  {users.length === 0 ? "No hay usuarios registrados." : "No se encontraron usuarios con la búsqueda ingresada."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination
          page={usersPagination.page}
          pageSize={usersPagination.pageSize}
          totalItems={usersPagination.totalItems}
          totalPages={usersPagination.totalPages}
          onPageChange={usersPagination.setPage}
        />
      </div>
    </section>
  );
}
