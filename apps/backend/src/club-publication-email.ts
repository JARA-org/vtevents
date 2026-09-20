import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { z } from "zod";
import type { ClubPublicationEmail, ClubPublicationNotifications } from "../../../packages/shared/src/contracts.js";
import { database } from "./store.js";
import { config } from "./config.js";
import { hash, seal, unseal } from "./security.js";
import { accountEmailReady, sendClubPublicationEmail } from "./account-email.js";
import { discordPublication } from "./discord-publication.js";

type Delivery = {_id:string; ownerId:string; revision:string; encrypted?:string; state:string; attempts:number; expiresAt:Date; nextAttempt:Date; lease?:string};
export const clubPublicationNotifications: ClubPublicationNotifications = {
  async flush() {
    if(!accountEmailReady()) return;
    const db=database(), messages=db.collection("discord_collected_messages");
    await db.collection("club_publication_email_outbox").updateMany({expiresAt:{$lte:new Date()},encrypted:{$exists:true}},{$unset:{encrypted:""},$set:{state:"expired"}});
    const pending=await messages.find({publicationEmailPending:true}).limit(10).toArray();
    if(!pending.length) return;
    const published=await discordPublication.list();
    const deliveries=db.collection<Delivery>("club_publication_email_outbox");
    for(const row of pending) {
      const clear=()=>messages.updateOne({key:row.key,fingerprint:row.fingerprint},{$unset:{publicationEmailPending:""}});
      const item=published.find(p=>p.event.sources.some(s=>s.source==="discord" && s.sourceId===row.key));
      if(!item || row.status!=="qualified") {await clear();continue;}
      const club=await db.collection("managed_clubs").findOne({_id:item.event.clubId as never,discordGuildId:row.guildId});
      if(!club) {await clear();continue;}
      const owner=await db.collection("user").findOne({$or:[{id:club.ownerId},{_id:ObjectId.isValid(club.ownerId)?new ObjectId(club.ownerId):club.ownerId}]});
      if(!owner || !z.string().email().safeParse(owner.email).success) {await clear();continue;}
      const id=hash(`club-publication:${row.key}:${row.fingerprint}`);
      const editUrl=new URL("/clubs",config.origin);
      editUrl.searchParams.set("club",String(club._id));editUrl.searchParams.set("event",item.event.id);
      const event=item.event;
      const format=(instant:string)=>new Intl.DateTimeFormat("en-US",{timeZone:event.timezone,dateStyle:"medium",timeStyle:"short"}).format(new Date(instant));
      const text=["Your Discord announcement has been published on My Gobbler.","",event.title,
        event.timeTBD?`${item.edit.values.date} — time to be confirmed`:`${format(event.start)}${event.end?` – ${format(event.end)}`:""} (${event.timezone})`,
        event.location||"",event.onlineUrl?`Watch / join online: ${event.onlineUrl}`:"", "", "Original announcement:",row.text,
        ...(row.imageTexts||[]).map((image:{text:string})=>`Flyer transcription: ${image.text}`),"",`Discord message: ${row.sourceUrl}`,"",
        `Review or correct your event: ${editUrl.href}`,"Sign in with the website account that registered this club. This link does not grant access to anyone else.",
        "", "My Gobbler — student-built, not affiliated with Virginia Tech."].join("\n");
      const payload:ClubPublicationEmail={to:owner.email,editUrl:editUrl.href,text,idempotencyKey:id};
      await deliveries.updateOne({_id:id},{$setOnInsert:{ownerId:club.ownerId,revision:item.edit.revision,encrypted:seal(payload),state:"pending",attempts:0,expiresAt:new Date(Date.now()+3600000),nextAttempt:new Date()}},{upsert:true});
      const existing=await deliveries.findOne({_id:id});
      if(!existing) continue;
      if(existing.state!=="pending" || existing.expiresAt.getTime()<=Date.now() || existing.attempts>=5 || existing.ownerId!==club.ownerId || existing.revision!==item.edit.revision) {
        await deliveries.updateOne({_id:id},{$set:{state:existing.state==="sent"?"sent":"cancelled"},$unset:{encrypted:""}});await clear();continue;
      }
      const lease=randomUUID();
      const delivery=await deliveries.findOneAndUpdate({_id:id,state:"pending",nextAttempt:{$lte:new Date()},attempts:{$lt:5}},{$set:{lease,nextAttempt:new Date(Date.now()+120000)},$inc:{attempts:1}},{returnDocument:"after"});
      if(!delivery?.encrypted) continue;
      try {
        // Revalidate after claim; withdrawn/revised events and removed owners cancel.
        const current=(await discordPublication.list()).find(p=>p.event.id===event.id);
        const stillOwner=await db.collection("managed_clubs").findOne({_id:club._id,ownerId:delivery.ownerId});
        const currentUser=await db.collection("user").findOne({_id:owner._id,email:owner.email});
        const frozen=unseal<ClubPublicationEmail>(delivery.encrypted);
        if(!current || current.edit.revision!==delivery.revision || !stillOwner || !currentUser || frozen.to!==owner.email) {
          await deliveries.updateOne({_id:id,lease},{$set:{state:"cancelled"},$unset:{encrypted:""}});await clear();continue;
        }
        await sendClubPublicationEmail(frozen);
        await deliveries.updateOne({_id:id,lease},{$set:{state:"sent"},$unset:{encrypted:""}});await clear();
      } catch {
        await deliveries.updateOne({_id:id,lease},{$set:{nextAttempt:new Date(Date.now()+Math.min(900000,60000*2**delivery.attempts))}});
        console.warn("club_publication_email_retry");
      }
    }
  },
};
