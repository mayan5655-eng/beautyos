// app/dashboard/page.tsx
import BeautyOS from "../beautyos.jsx";
import OwnerEntry from "./owner/OwnerEntry";
import PhoneGate from "../PhoneGate";

export default function DashboardPage() {
  // The installed app opens here (the manifest start_url), so the phone prompt is mounted here as well as on "/".
  return <><BeautyOS ownerEntry={<OwnerEntry />} /><PhoneGate /></>;
}