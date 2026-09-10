import { Navigate, Route, Routes } from "react-router-dom";
import { getStaff, isAuthed } from "./lib/auth";
import Landing from "./pages/Landing";
import NewTicket from "./pages/NewTicket";
import Track from "./pages/Track";
import Login from "./pages/Login";
import OperatorDashboard from "./pages/OperatorDashboard";
import ExpertDashboard from "./pages/ExpertDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import Analytics from "./pages/Analytics";

function Protected({ roles, children }: { roles?: string[]; children: JSX.Element }) {
  if (!isAuthed()) return <Navigate to="/login" replace />;
  const staff = getStaff();
  if (roles && staff && !roles.includes(staff.role)) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/new" element={<NewTicket />} />
      <Route path="/track" element={<Track />} />
      <Route path="/login" element={<Login />} />

      <Route path="/operator" element={<Protected roles={["operator", "admin"]}><OperatorDashboard /></Protected>} />
      <Route path="/expert" element={<Protected roles={["expert"]}><ExpertDashboard /></Protected>} />
      <Route path="/admin" element={<Protected roles={["admin"]}><AdminDashboard /></Protected>} />
      <Route path="/analytics" element={<Protected roles={["operator", "expert", "admin"]}><Analytics /></Protected>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
