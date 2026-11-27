"use client";
// app/sections/useAdvisorCommunitySection.jsx — part of the owner's app: 191 lines of state, effects and handlers.
//
// Moved out of the BeautyOS component (app/beautyos.jsx) by scripts/extract-section.mjs, byte for byte: nothing between the
// two markers below was rewritten, and the component calls this hook where the statements used to be, so every hook in
// here still runs in the same order. What it reads arrives in `ctx`; what the rest of the app reads from it is returned.
// scripts/check-screens.mjs holds both lists equal to the call in beautyos.jsx.
import { supabase } from "../supabase";
import { PUBLIC_BUCKET } from "../../lib/clientImages";
import { loadUpgrades } from "../UpgradesStore";
import { COULD_NOT_SHRINK_HE } from "@/lib/imageResize";
import { tr } from "@/lib/i18n/tr";

export function useAdvisorCommunitySection(ctx) {
  const {
    advisorInput, advisorSending, askConfirm, compressImage, guardWrite, handleDbError, newPost, savingPost,
    setAdvisorInput, setAdvisorMessages, setAdvisorSending, setCommunityLoading, setCommunityPosts, setNewPost,
    setPostImageUploading, setProtocols, setProtocolsLoading, setSavingPost, setShowPostModal, settings,
    setWaLogError, setWaLogLoading, setWaMessages, toast,
  } = ctx;
  /* @section-body */const loadCommunityPosts = async () => {
    setCommunityLoading(true);
    try {
      const { data } = await supabase
        .from("community_posts")
        .select("*")
        .order("created_at", { ascending: false });
      setCommunityPosts(data || []);
    } catch { setCommunityPosts([]); }
    finally { setCommunityLoading(false); }
  };
  // Load treatment protocols for the current tenant
  const loadProtocols = async () => {
    setProtocolsLoading(true);
    try {
      const { data } = await supabase
        .from("treatment_protocols")
        .select("*")
        .order("created_at", { ascending: false });
      setProtocols(data || []);
    } catch { setProtocols([]); }
    finally { setProtocolsLoading(false); }
  };

  // Load the AI advisor conversation history (tenant resolved server-side).
  const loadAdvisor = async () => {
    try {
      const res = await fetch("/api/advisor");
      const data = await res.json();
      setAdvisorMessages(res.ok && Array.isArray(data.messages) ? data.messages : []);
    } catch { setAdvisorMessages([]); }
  };

  // Send a question to the AI advisor; optimistically show it, then the reply.
  const sendAdvisor = async () => {
    if (guardWrite()) return;
    const q = advisorInput.trim();
    if (!q || advisorSending) return;
    setAdvisorSending(true);
    setAdvisorInput("");
    // Optimistic: show the user's question immediately.
    setAdvisorMessages(prev => [...(prev || []), { id: "tmp-" + Date.now(), role: "user", content: q }]);
    try {
      const res = await fetch("/api/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      // Refusals (not signed in, plan, a spend limit) come back as ordinary JSON,
      // before anything is streamed. A real answer arrives as newline-delimited
      // JSON: { t: "d", x: text } deltas, then { t: "done" } (or { t: "error" }).
      if (!(res.headers.get("content-type") || "").includes("ndjson")) {
        const data = await res.json().catch(() => ({}));
        toast(data.error || tr("היועץ לא הצליח לענות"), "error");
        return;
      }
      const aid = "a-" + Date.now();
      let shown = "";
      const show = (text, streaming) => setAdvisorMessages(prev => {
        const list = prev || [];
        return list.some(m => m.id === aid)
          ? list.map(m => (m.id === aid ? { ...m, content: text, streaming } : m))
          : [...list, { id: aid, role: "assistant", content: text, streaming }];
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let failed = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const raw = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!raw) continue;
          let ev;
          try { ev = JSON.parse(raw); } catch { continue; }
          if (ev.t === "d") { shown += ev.x; show(shown.trimStart(), true); }
          else if (ev.t === "done") { show(shown.trim(), false); if (ev.capNotice) toast(ev.capNotice); }
          else if (ev.t === "error") failed = ev.error || "היועץ לא הצליח לענות";
        }
      }
      if (failed) {
        // Keep what was written (it was shown), but it was not saved: say so.
        if (shown) show(shown.trim(), false);
        toast(failed, "error");
      }
    } catch (err) {
      toast(tr("אין חיבור. היועץ לא קיבל את השאלה, נסי שוב"), "error");
    } finally {
      setAdvisorSending(false);
      loadUpgrades(true); // the meter and the chip show the question she just asked
    }
  };

  // Upload an image for a community post to the shared bucket
  const uploadPostImage = async (file) => {
    if (!file) return;
    setPostImageUploading(true);
    try {
      const { base64, blob } = await compressImage(file, 1280, 0.82);
      // Community images are shown publicly to other businesses in the community
      // feed, so they live in a separate PUBLIC bucket (not the private
      // client-images bucket) and keep using a public URL.
      const tid = settings?.tenant_id || "shared";
      const fileName = `${tid}/${Date.now()}.jpg`;
      const { error: ue } = await supabase.storage.from(PUBLIC_BUCKET).upload(fileName, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
      if (!ue) {
        const { data: urlData } = supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(fileName);
        setNewPost(p => ({ ...p, image_url: urlData.publicUrl }));
        toast(tr("התמונה הועלתה"));
      } else { toast(tr("שגיאה בהעלאת תמונה"), "error"); }
    } catch { toast(COULD_NOT_SHRINK_HE, "error"); } // compressImage rejects only when the phone cannot read the photo
    finally { setPostImageUploading(false); }
  };

  // Save a new community post
  const saveCommunityPost = async () => {
    if (guardWrite()) return;
    if (savingPost) return;
    if (!newPost.body && !newPost.title) { toast(tr("כתבי תוכן לפוסט"), "error"); return; }
    setSavingPost(true);
    try {
      const { data, error } = await supabase.from("community_posts").insert([{
        title: newPost.title || null,
        body: newPost.body || null,
        image_url: newPost.image_url || null,
        post_type: newPost.post_type || "update",
        cta_label: newPost.cta_label || null,
      }]).select();
      if (error) { handleDbError(error, "create community post"); return; }
      // Zero rows back is a refusal, not a success. Saying "published" here and
      // leaving the composer empty would lose what she wrote.
      if (!data || !data[0]) { toast(tr("הפוסט לא פורסם. נסי שוב"), "error"); return; }
      setCommunityPosts(prev => [data[0], ...prev]);
      setNewPost({ title:"", body:"", post_type:"update", cta_label:"", image_url:"" });
      setShowPostModal(false);
      toast(tr("הפוסט פורסם למרחב הלקוחות"));
    } finally { setSavingPost(false); }
  };

  // Delete a community post
  // Permanent, and it was one tap.
  //
  // Every other destructive path in this app asks first or is reversible: a
  // service checks four tables for references before it will delete, an expense
  // goes through askConfirm, an appointment soft-cancels with a 6.5s undo. This
  // one deleted a post outright on a single tap of a 10.5px "מחיקה" link sitting
  // next to the post's own text, with no undo and no way to get the wording back.
  //
  // Takes the post rather than an id so the dialog can quote what is about to
  // go, the same way the expense dialog names the expense. "Are you sure?" with
  // nothing in it is a question she cannot actually answer.
  const deleteCommunityPost = async (post) => {
    if (guardWrite()) return;
    const id = post?.id ?? post;   // tolerate a bare id from any older caller
    const body = String(post?.body || "").trim();
    const excerpt = body.length > 60 ? `${body.slice(0, 60)}…` : body;
    askConfirm({
      title: tr("מחיקת פוסט"),
      message: excerpt
        ? tr("למחוק את הפוסט \"{0}\"? לא ניתן לשחזר אותו.", [excerpt])
        : tr("למחוק את הפוסט? לא ניתן לשחזר אותו."),
      confirmText: tr("מחיקה"),
      danger: true,
      onConfirm: async () => {
        // Supabase returns { error } rather than throwing, so a try/catch never
        // fired on a real DB/RLS failure — the post vanished from the UI but not
        // the database.
        const { error } = await supabase.from("community_posts").delete().eq("id", id);
        if (error) { handleDbError(error, "delete community post"); return; }
        setCommunityPosts(prev => prev.filter(p => p.id !== id));
        toast(tr("הפוסט נמחק"));
      },
    });
  };

  const loadWaMessages = async () => {
    setWaLogLoading(true); setWaLogError("");
    try {
      const res = await fetch("/api/messages");
      const data = await res.json().catch(() => ({}));
      if (data.success) setWaMessages(data.messages || []);
      else setWaLogError(data.error || tr("לא הצלחנו לטעון את ההודעות, אפשר לרענן"));
    } catch (err) {
      setWaLogError(tr("אין חיבור. לא הצלחנו לטעון את ההודעות, אפשר לרענן"));
    }
    setWaLogLoading(false);
  };/* @section-end */
  return { deleteCommunityPost, loadAdvisor, loadCommunityPosts, loadProtocols, loadWaMessages, saveCommunityPost,
    sendAdvisor, uploadPostImage };
}
