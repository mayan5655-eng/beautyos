// app/dashboard/page.tsx
import BeautyOS from "../beautyos.jsx";
import OwnerEntry from "./owner/OwnerEntry";

export default function DashboardPage() {
  return <BeautyOS ownerEntry={<OwnerEntry />} />;
}