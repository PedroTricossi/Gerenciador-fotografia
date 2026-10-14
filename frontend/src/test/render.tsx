import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router";
import { AppProviders } from "../app/App";
import { routes } from "../app/routes";

export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const user = userEvent.setup();
  const view = render(
    <AppProviders retry={false}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...view, user, router };
}
