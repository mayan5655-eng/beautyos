"use client";
// app/sections/useClientPhotosSection.jsx — part of the owner's app: 153 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
import { useEffect } from "react";
import { supabase } from "../supabase";
import { PRIVATE_BUCKET, clientImagePath } from "../../lib/clientImages";
import { loadUpgrades } from "../UpgradesStore";
import { MAX_SOURCE_BYTES, TOO_LARGE_SOURCE_HE, COULD_NOT_SHRINK_HE, notUploadable } from "@/lib/imageResize";
import { tr } from "@/lib/i18n/tr";

export function useClientPhotosSection(ctx) {
  const {
    handleDbError, scanLoading, setClientPhotos, setClientScans, setPhotoTreatmentPrefill, setPhotoUploading,
    setScanLoading, setScanReport, setScansLoading, setScanStep, settings, toast,
  } = ctx;
  /* @section-body */const compressImage = (file, maxDim = 1024, quality = 0.8) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > height && width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
          else if (height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          canvas.toBlob(
            (blob) => resolve({ base64: dataUrl.split(",")[1], mediaType: "image/jpeg", blob }),
            "image/jpeg", quality
          );
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Load all saved skin scans for a client (newest first)
  const loadClientScans = async (clientId) => {
    setScansLoading(true);
    try {
      const { data } = await supabase
        .from("skin_scans")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      setClientScans(data || []);
    } catch { setClientScans([]); }
    finally { setScansLoading(false); }
  };

  // Load all before/after photos for a client (newest first)
  const loadClientPhotos = async (clientId) => {
    try {
      const { data } = await supabase
        .from("client_photos")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      setClientPhotos(data || []);
    } catch { setClientPhotos([]); }
  };

  // Upload a before/after photo pair for a client
  const uploadClientPhoto = async (beforeFile, afterFile, treatment, note, clientId) => {
    if (!beforeFile && !afterFile) { toast(tr("בחרי לפחות תמונה אחת"), "error"); return; }
    setPhotoUploading(true);
    try {
      const tid = settings?.tenant_id;
      if (!tid) { toast(tr("לא זוהה עסק. אפשר לרענן את המסך ולנסות שוב."), "error"); return; }
      // Store tenant-scoped PATHS (private bucket); display signs them on demand.
      let beforeUrl = null, afterUrl = null;
      // An upload that failed used to be ignored, and the row was saved pointing at a photo that does not exist. Now
      // each one is checked, and nothing is saved unless every chosen photo went up.
      const putOne = async (file, side) => {
        if (file.size > MAX_SOURCE_BYTES) { toast(TOO_LARGE_SOURCE_HE, "error"); return null; }
        let blob;
        try { ({ blob } = await compressImage(file, 1280, 0.82)); } catch { blob = null; }
        if (!blob || notUploadable(blob)) { toast(COULD_NOT_SHRINK_HE, "error"); return null; }
        const fn = clientImagePath(tid, clientId, `${side}-${Date.now()}.jpg`);
        const { error: upErr } = await supabase.storage.from(PRIVATE_BUCKET).upload(fn, blob, { contentType: "image/jpeg" });
        if (upErr) { handleDbError(upErr, "upload client photo"); return null; }
        return fn;
      };
      if (beforeFile) { beforeUrl = await putOne(beforeFile, "before"); if (!beforeUrl) return; }
      if (afterFile) {
        afterUrl = await putOne(afterFile, "after");
        if (!afterUrl) { if (beforeUrl) await supabase.storage.from(PRIVATE_BUCKET).remove([beforeUrl]); return; }
      }
      const { error } = await supabase.from("client_photos").insert([{
       tenant_id: settings.tenant_id,
        client_id: clientId,
        before_url: beforeUrl,
        after_url: afterUrl,
        treatment: treatment || null,
        note: note || null,
      }]);
      if (error) { handleDbError(error, "save client photo"); return; }
      toast(tr("התמונות נשמרו"));
      setPhotoTreatmentPrefill("");
      loadClientPhotos(clientId);
    } catch { toast(tr("שגיאה בהעלאת התמונות"), "error"); }
    finally { setPhotoUploading(false); }
  };

  // Scan a client's skin: analyze with AI, store the image, and save the full
  // report to skin_scans so it builds a history per client.
  const scanClientSkin = async (client, file) => {
    if (!file || scanLoading) return;
    setScanLoading(true); setScanReport(null);
    try {
      // Compress in the browser first to avoid 413 (payload too large)
      const { base64, mediaType, blob } = await compressImage(file);
      const res = await fetch("/api/skin-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mediaType, tenantId: settings.tenant_id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data.success) { toast(data.error || tr("לא הצלחנו לנתח את התמונה, אפשר לנסות שוב"), "error"); setScanLoading(false); return; }
      setScanReport(data.report);

      // Upload the scan image to storage (best-effort)
      let imageUrl = null;
      try {
        const tid = settings?.tenant_id;
        if (tid) {
          // Tenant-scoped PATH in the private bucket; signed on display.
          const fileName = clientImagePath(tid, client.id, `scan_${Date.now()}.jpg`);
          const { error: ue } = await supabase.storage.from(PRIVATE_BUCKET).upload(fileName, blob, { contentType: "image/jpeg" });
          if (!ue) imageUrl = fileName;
        }
      } catch {}

      // Save the full report to skin_scans (per-client history).
      // tenant_id is set automatically by the column default (get_user_tenant_id()).
      try {
        await supabase.from("skin_scans").insert({
          client_id: client.id,
          image_url: imageUrl,
          report: data.report,
          score: data.report.score,
          skin_type: data.report.skin_type,
        });
      } catch (e) { /* non-fatal */ }

      // Refresh history if this client's card is open
      loadClientScans(client.id);
      toast(tr("✦ הסריקה נשמרה לכרטיס"));
    } catch (err) {
      toast(tr("שגיאה בסריקה"), "error");
    } finally {
      setScanLoading(false);
      loadUpgrades(true); // the meter and the chip show the scan she just used
    }
  };

  // Cycle the reassuring "מנתחת..." steps while a scan is in flight (UI only).
  useEffect(() => {
    if (!scanLoading) { setScanStep(0); return; }
    const id = setInterval(() => setScanStep((s) => s + 1), 1800);
    return () => clearInterval(id);
  }, [scanLoading]);/* @section-end */
  return { compressImage, loadClientPhotos, loadClientScans, scanClientSkin, uploadClientPhoto };
}
