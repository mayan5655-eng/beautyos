"use client";
// app/sections/useUploadsSection.jsx — part of the owner's app: 182 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
import { supabase } from "../supabase";
import { PRIVATE_BUCKET, PUBLIC_BUCKET, clientImagePath, toStoragePath } from "../../lib/clientImages";
import { resizeImage, IMAGE_PRESETS, MAX_SOURCE_BYTES, TOO_LARGE_SOURCE_HE, notUploadable } from "@/lib/imageResize";
import { STUCK_HE } from "@/lib/errorCopy";
import { tr } from "@/lib/i18n/tr";

export function useUploadsSection(ctx) {
  const {
    askConfirm, guardWrite, handleDbError, setBrandUploading, setClients, setEditSettings, setSelectedClient,
    settings, setUploading, toast,
  } = ctx;
  /* @section-body */const handleUploadImage = async (e,client) => {
    if (guardWrite()) return;
    const file=e.target.files[0];if(!file)return;
    if(!/^image\//.test(file.type||"")){toast(tr("קובץ תמונה בלבד"),"error");return;}
    if(file.size>MAX_SOURCE_BYTES){toast(TOO_LARGE_SOURCE_HE,"error");return;}
    setUploading(true);
    try {
      const tid=settings?.tenant_id;
      if(!tid){toast(STUCK_HE,"error");return;}
      // Resized like every other photo: this used to send the original (several MB from a phone camera, and a HEIC
      // no browser can show), named after the phone's file name, which can carry characters a storage key refuses.
      const blob=await resizeImage(file,IMAGE_PRESETS.gallery);
      const why=notUploadable(blob);
      if(why){toast(why,"error");return;}
      // Tenant-scoped, private path. We store the PATH (not a URL); display
      // resolves a signed URL on demand via <SignedImage>.
      const fileName=clientImagePath(tid,client.id,`${Date.now()}.${/png/i.test(blob.type)?"png":"jpg"}`);
      const {error:ue}=await supabase.storage.from(PRIVATE_BUCKET).upload(fileName,blob,{contentType:blob.type||"image/jpeg"});
      if(ue){handleDbError(ue, "upload image"); return;}
      const newImages=[...(client.images||[]),fileName];
      const {data,error}=await supabase.from("clients").update({images:newImages}).eq("id",client.id).select();
      if(error){handleDbError(error, "save image url"); return;}
      if(!data||!data[0]){
        // The file uploaded but the row did not take it. Clean the orphan up
        // rather than leaving a paid-for object nothing points at.
        await supabase.storage.from(PRIVATE_BUCKET).remove([fileName]);
        toast(tr("התמונה לא נשמרה בכרטיס, נסי שוב"),"error");
        return;
      }
      setClients(prev=>prev.map(c=>c.id===client.id?data[0]:c));setSelectedClient(data[0]);
      toast(tr("התמונה הועלתה"));
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteImage = (client,imageUrl) => {
    if (guardWrite()) return;
    askConfirm({
      title: tr("מחיקת תמונה"),
      message: tr("למחוק את התמונה?"),
      confirmText: tr("מחיקה"),
      danger: true,
      onConfirm: async () => {
        const newImages=(client.images||[]).filter(img=>img!==imageUrl);
        // Row first, then the object. The other order can leave the card
        // pointing at a file that is already gone.
        const {data,error}=await supabase.from("clients").update({images:newImages}).eq("id",client.id).select();
        if(error){handleDbError(error, "delete image"); return;}
        if(!data||!data[0]){ toast(tr("המחיקה לא נשמרה, נסי שוב"),"error"); return; }
        setClients(prev=>prev.map(c=>c.id===client.id?data[0]:c));setSelectedClient(data[0]);
        // Through toStoragePath, which normalises both shapes the column
        // holds: bare paths written since the private-bucket move, and full
        // URLs from before it. .remove() takes paths, so passing the raw value
        // would delete nothing for every older row while reporting success.
        const path = toStoragePath(imageUrl);
        if (path) {
          const { error: re } = await supabase.storage.from(PRIVATE_BUCKET).remove([path]);
          if (re) { toast(tr("התמונה הוסרה מהכרטיס, אך הקובץ נשאר בשרת"),"error"); return; }
        }
        toast(tr("התמונה נמחקה"));
      },
    });
  };

  // Resize in the browser, then upload. Every branding image used to go into
  // the bucket exactly as shot: a 4032x3024 phone photo, three megabytes,
  // served at full size to every visitor of her booking page over their mobile
  // data as the first thing that has to paint. lib/imageResize has the per-
  // asset presets and the reasons behind each one - notably that a logo stays
  // PNG, because flattening a transparent logo onto white JPEG gives her a
  // white rectangle everywhere the page is not white.
  //
  // The check on the picked file (MAX_SOURCE_BYTES, 25 MB) is an INPUT guard: it is about what her phone can
  // decode without falling over, not about what leaves it. What leaves it is checked after resizing
  // (notUploadable). It was 3 MB until 2026-10-18 and refused ordinary phone photos.
  const uploadOne = async (file, preset, tid, name) => {
    const blob = await resizeImage(file, preset);
    // resizeImage fails open; a phone that could not decode the photo must not send the 20 MB original.
    const why = notUploadable(blob, { allowSvg: preset === IMAGE_PRESETS.logo });
    if (why) { toast(why, "error"); return { error: null, skipped: true }; }
    const ext = preset.type === "image/png" ? "png" : (/svg/i.test(file.type) ? "svg" : "jpg");
    const path = `${tid}/branding/${name}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(PUBLIC_BUCKET).upload(path, blob, { contentType: blob.type || preset.type, cacheControl: "31536000" });
    if (error) return { error };
    return { url: supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(path)?.data?.publicUrl || "" };
  };

  // Upload a public branding asset to the PUBLIC bucket under the clinic's OWN
  // tenant folder ("<tenant>/branding/…"), so one clinic can never write into
  // another's path. Stores the public URL in editSettings.branding (persisted
  // on Save).
  const uploadBrandAsset = async (file, key) => {
    if(!file) return;
    if(!/^image\//.test(file.type||"")){ toast(tr("קובץ תמונה בלבד"),"error"); return; }
    if(file.size > MAX_SOURCE_BYTES){ toast(TOO_LARGE_SOURCE_HE,"error"); return; }
    const tid = settings?.tenant_id;
    if(!tid){ toast(STUCK_HE,"error"); return; }
    setBrandUploading(key);
    try {
      const preset = key === "logo_url" ? IMAGE_PRESETS.logo
        : key === "portrait_url" ? IMAGE_PRESETS.portrait
        : IMAGE_PRESETS.hero;
      const main = await uploadOne(file, preset, tid, key);
      if (main.error) { handleDbError(main.error, "upload brand asset"); return; }
      if (main.skipped || !main.url) return; // too large even after resizing: uploadOne already said so
      const patch = { [key]: main.url };

      // THE PORTRAIT IS ALSO THE LINK PREVIEW, so it is stored twice: once as
      // she sees it on the page, and once cropped to the 1200x630 every
      // unfurler is built around. Derived at upload rather than on demand
      // because there is nowhere to derive it later - the page is static and
      // the preview is fetched by WhatsApp, not by us.
      if (key === "portrait_url") {
        const og = await uploadOne(file, IMAGE_PRESETS.portraitOg, tid, "portrait_og");
        // A failed derivative costs the link preview, not the portrait. Keep
        // the photo she just uploaded rather than failing the whole action.
        if (!og.error && og.url) patch.portrait_og_url = og.url;
      }

      setEditSettings(prev=>({...prev, branding:{...((prev?.branding&&typeof prev.branding==="object")?prev.branding:{}), ...patch }}));
      toast(tr("התמונה הועלתה, לחצי שמירה"));
    } finally { setBrandUploading(""); }
  };

  // Upload one gallery image and APPEND its public URL to branding.gallery (an
  // array), same tenant-scoped path rules as uploadBrandAsset. The public /book
  // page renders these as a Google-style photo grid.
  // Same shape as the gallery upload, into branding.clinic_photos, capped at 3:
  // atmosphere shots of the room, not the work.
  const uploadClinicPhoto = async (file) => {
    if(!file) return;
    if(!/^image\//.test(file.type||"")){ toast(tr("קובץ תמונה בלבד"),"error"); return; }
    if(file.size > MAX_SOURCE_BYTES){ toast(TOO_LARGE_SOURCE_HE,"error"); return; }
    const tid = settings?.tenant_id;
    if(!tid){ toast(STUCK_HE,"error"); return; }
    setBrandUploading("clinic");
    try {
      const up = await uploadOne(file, IMAGE_PRESETS.gallery, tid, "clinic");
      if(up.error){ handleDbError(up.error, "upload clinic photo"); return; }
      if(up.skipped) return;
      const url = up.url;
      if(url) setEditSettings(prev=>{ const b=(prev?.branding&&typeof prev.branding==="object")?prev.branding:{}; const ph=Array.isArray(b.clinic_photos)?b.clinic_photos:[]; if(ph.length>=3){ toast(tr("עד 3 תמונות של העסק"),"error"); return prev; } return {...prev, branding:{...b, clinic_photos:[...ph, url]}}; });
      toast(tr("התמונה נוספה, לחצי שמירה"));
    } finally { setBrandUploading(""); }
  };

  // Her own photo for one treatment card on the public page. Stored in
  // branding.service_images keyed by service id, so no migration and no column:
  // a service without an entry wears the default for its name.
  const uploadServicePhoto = async (serviceId, file) => {
    if(!file || !serviceId) return;
    if(!/^image\//.test(file.type||"")){ toast(tr("קובץ תמונה בלבד"),"error"); return; }
    if(file.size > MAX_SOURCE_BYTES){ toast(TOO_LARGE_SOURCE_HE,"error"); return; }
    const tid = settings?.tenant_id;
    if(!tid){ toast(STUCK_HE,"error"); return; }
    setBrandUploading("svc:"+serviceId);
    try {
      const up = await uploadOne(file, IMAGE_PRESETS.gallery, tid, "service");
      if(up.error){ handleDbError(up.error, "upload service photo"); return; }
      if(up.skipped) return;
      if(up.url) setEditSettings(prev=>{ const b=(prev?.branding&&typeof prev.branding==="object")?prev.branding:{}; const m=(b.service_images&&typeof b.service_images==="object"&&!Array.isArray(b.service_images))?b.service_images:{}; return {...prev, branding:{...b, service_images:{...m,[serviceId]:up.url}}}; });
      toast(tr("התמונה נוספה, לחצי שמירה"));
    } finally { setBrandUploading(""); }
  };

  const uploadGalleryImage = async (file) => {
    if(!file) return;
    if(!/^image\//.test(file.type||"")){ toast(tr("קובץ תמונה בלבד"),"error"); return; }
    if(file.size > MAX_SOURCE_BYTES){ toast(TOO_LARGE_SOURCE_HE,"error"); return; }
    const tid = settings?.tenant_id;
    if(!tid){ toast(STUCK_HE,"error"); return; }
    setBrandUploading("gallery");
    try {
      const up = await uploadOne(file, IMAGE_PRESETS.gallery, tid, "gallery");
      if(up.error){ handleDbError(up.error, "upload gallery image"); return; }
      if(up.skipped) return;
      const url = up.url;
      if(url) setEditSettings(prev=>{ const b=(prev?.branding&&typeof prev.branding==="object")?prev.branding:{}; const gal=Array.isArray(b.gallery)?b.gallery:[]; return {...prev, branding:{...b, gallery:[...gal, url]}}; });
      toast(tr("התמונה נוספה לגלריה, לחצי שמירה"));
    } finally { setBrandUploading(""); }
  };/* @section-end */
  return { handleDeleteImage, handleUploadImage, uploadBrandAsset, uploadClinicPhoto, uploadGalleryImage,
    uploadServicePhoto };
}
