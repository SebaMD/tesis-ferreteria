import { createContext } from "react";

const FavoritesContext = createContext({ enabled: false, products: [], loading: false });
export default FavoritesContext;
