// app/dashboard/page.tsx
import BeautyOSLoader from "../BeautyOSLoader";
import OwnerEntry from "./owner/OwnerEntry";

export default function DashboardPage() {
  // The one address of the app. The negative margin undoes the layout's 32px, which is for the other pages under /dashboard: this shell is full-bleed.
  return <div style={{ margin: "-32px 0" }}><BeautyOSLoader ownerEntry={<OwnerEntry />} /></div>;
}