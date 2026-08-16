# Why this gets built in nine steps, and in this order

This is the leadership note. It is the idea, not a tour of the demo.

If you have five minutes and you are deciding whether this is worth a conversation, stay here. If you want to run the product, go to the [README](README.md).

The essay below is the destination. The table is what this repository can show today. Layer 9 — commitments — is the end of the stack and is **not built**. Several layers under it are only partly in the demo. That is deliberate: the first four layers are what a customer can feel immediately; the rest cannot be faked without breaking the order.

| Layer | What it is | In this repo today |
|---|---|---|
| 1. Identity | Two names are one customer | **Yes.** `/entities`, `/review`, and the Admin scoreboard. |
| 2. Structure | A map of what exists, not a warehouse of copies | **Partial.** The demo stores a governed fact ledger with provenance. It does not yet leave the numbers in the original tools and only read them at ask-time. |
| 3. Freshness | How fast a fact moves, and how costly it is to be wrong | **Yes.** Freshness rules on `/settings`; age on every answer. |
| 4. Authority | Who is allowed to be right, said out loud | **Yes.** Systems of record; `/conflicts` shows both sides and the sentence that picked the winner. |
| 5. The person asking | Every answer is for one viewer, checked now | **Not yet.** This is a single-tenant demo. You can disconnect a whole source; there is no per-person check against the original tool. |
| 6. Conclusions | Worked out fresh from what that person can see | **Partial.** Answers recompute when evidence or a source connection changes. They are not yet per-person. |
| 7. Shared truth | A short, dated, approved list of what we officially agree | **Partial.** You can propose and ratify declarations on `/settings`. Approving does **not** write the correction back into the CRM or the Sheet. |
| 8. Inheritance | The next person starts from the decisions already made | **Not yet.** |
| 9. Commitments | Knowing becomes doing — obligations with an author, reasons, and an outcome check | **Not yet.** The layer the stack ends on. |

---

## The problem

A company's knowledge is spread across the tools people work in every day — the CRM, spreadsheets, email, chat, call recordings. Three things go wrong.

**Nobody can find anything.** The answer exists, but it is split across a call transcript, a chat thread, and a spreadsheet.

**What people do find is out of date.** The document was accurate eight months ago.

**The sources contradict each other, and nothing settles the argument.** The spreadsheet says one number. A chat message says another. The contract says a third.

The first problem is a search problem, and search problems are largely solved. The second and third are not search problems. They are questions about which answer is allowed to be right, and how old it is permitted to be. That is what we are building. A tool that solves only the first is a search box. A tool that solves the second and third changes how decisions get made.

And there is a fourth thing that goes wrong, which only becomes visible once the first three are fixed. **The company agrees on what is true, decides what to do about it — and the decision evaporates.** It leaves in a chat message, loses its author in a week, its reasons in a month, and its existence in a quarter. Knowledge is not the whole problem. What the company has committed to do about the knowledge is the other half, and it is the half this stack ends on.

## Why the order matters

What follows is not a feature list. It is a stack. Each step only becomes meaningful once the one below it is already working, so the sequence is not a matter of preference or priority — it cannot be shuffled without the later steps becoming untestable.

Read each step as: what it is, the assumption to let go of, and what breaks if it is missing.

---

### 1. Identity — knowing that two names are one customer

"Acme," "Acme Corp," and "ACME Inc." show up across four different tools. The system has to know these are one company before it can say anything about that company.

*The assumption to drop:* that this is a spelling problem, and the boring part before the real work.

It is the load-bearing part. We test it first, on real examples, before anything else is built. If it fails, we stop and fix it rather than build on top of it.

**Without it:** the system gives four confident answers about one customer, each one correct about a fragment.

---

### 2. Structure — a map, not a warehouse

The system does not copy company data into itself. It keeps a map: which things exist, how they relate, and where the real answer lives. The actual numbers stay in the tools that own them and are read when someone asks.

*The assumption to drop:* that we need to pull everything in and hold it.

The map grows with the number of real things a company cares about — customers, products, deals — not with how much data exists about them. That is what keeps it affordable, and what makes removing someone's access clean: there is no copy sitting anywhere to go and delete.

**Without it:** we become a warehouse of copies, and every copy is a copy that can be wrong, and that we are responsible for deleting correctly, forever.

---

### 3. Freshness — knowing when to go and look

Some facts change constantly without anyone announcing it: stock counts, deal stages. Some change deliberately a few times a year: pricing, policy, org charts. Some never change at all: a signed contract, last quarter's call.

It is Tuesday and the renewal call is tomorrow.
The system checks the deal stage right now, and the inventory number right now, because both move without warning.
Then it reaches for the pricing tier, which has only changed twice this year — and checks that live too, because quoting the wrong price floor into a renewal is expensive in a way that a slightly stale org chart is not.

Two different questions. How fast does this change? And how much does it cost us to be wrong? The second one is the one everybody forgets.

**Without it:** the system walks into a renewal call with a number that was true in March and states it with total confidence.

---

### 4. Authority — deciding who is allowed to be right

For any given kind of fact, one source is the official one. Inventory might live in a spreadsheet. Deal stage lives in the CRM. Chat, email, and call notes can explain and support, but they are never allowed to be the official answer.

This is set up once, during setup, as a short list of decisions — under a dozen, not hundreds.

*The assumption to drop:* that when two sources disagree, the newer one is simply correct.

Show both answers. Say which one won. Say why it won.

Choosing quietly is the thing we will not do. The moment the system picks a winner without saying so, the user loses the only way they had to notice it was wrong.

**Without it:** we become a fourth source of truth arguing with the three that already disagree.

---

### 5. The person asking — every answer belongs to one viewer

Every question is answered on behalf of one specific person, using only what that person is allowed to see in the original tools. The check happens at the moment of the question, against the source itself. If we cannot confirm someone is allowed to see something, we leave it out of the answer.

*The assumption to drop:* that we can check permissions once when we take the data in, and rely on that afterwards.

Permission is not a property of the data. It is a property of the moment. Someone allowed to see a folder last week may not be today.

**Without it:** one person's private thread ends up informing a colleague's answer. That is not a bug we recover from. That is the end of the company.

---

### 6. Conclusions — worked out fresh, never handed around

"This account is at risk" is not a stored fact. It is a conclusion the system works out from what that specific person can currently see. Take away one of the three things it was based on and it is worked out again from the remaining two, and shown with less confidence. Take away all three and it goes away.

*The assumption to drop:* that once the system has figured something out, it can save it and reuse it for whoever asks next.

Two people with identical access can reach different conclusions. That is correct, not something to tidy up. A conclusion is only as good as what the person looking at it is entitled to see.

**Without it:** a conclusion drawn from a document someone lost access to keeps quietly answering questions.

---

### 7. Shared truth — the small set of things we officially agree on

A short, governed list of what the company asserts to be true. Short enough that a person could read all of it. Everything on it is dated, attributed to whoever approved it, marked with who is allowed to see it, and set to expire and require re-confirmation.

Anyone can propose something. Only the owner of that area can approve it. Approving it also corrects the original system it came from — so we fix the CRM rather than quietly disagreeing with it.

*The assumption to drop:* that approval steps are bureaucracy on top of the product.

Because conclusions are never passed between people, this is the only route by which one person's knowledge becomes everybody's. Anyone may contribute. Only owners may confirm. Nothing becomes official on its own.

**Without it:** if adding to this list ever feels like a chore, nobody does it, and what we have left is a very good personal search tool.

---

### 8. Inheritance — the second person starts where the first finished

When someone new joins, the company's existing decisions are applied to their view automatically — quietly, and reversibly. They only get asked about the genuinely new cases nobody has settled yet. After setup, the first thing they are shown is the list: here are the decisions applied on your behalf, and you can change any of them.

*The assumption to drop:* that inheriting the decisions means inheriting the information.

They inherit the rules, never the content. What they are allowed to see is still governed separately, fact by fact.

**Without it:** every new person repeats the work the last one already did, and the cost of adding a person never comes down.

---

### 9. Commitments — where knowing becomes doing

Everything below this line is about knowledge: what is true, how fresh it is, who is allowed to be right, who is allowed to see it. But a company runs on knowledge plus commitments, and a commitment is a different kind of object. "The price floor is 15%" is a fact — layer 7 holds it. "Every rep now behaves differently, and we can tell whether the change actually happened" is an obligation, and no layer below can hold an obligation. There is no primitive down there for an action somebody owes.

So this layer carries decisions the way humans carry them to each other, because the human transaction has parts that all do real work: the decision arrives *from a named person with standing to make it*, it *carries its reasons* so people can handle the cases the author never imagined, the recipient *acknowledges it* — or disputes it, out loud, through a channel that routes back to the author — the change is *translated into each tool* by the person who owns that tool, and then the system *checks the outcome*: not "is Raj complying," which is surveillance and kills the whole mechanism, but "are sub-15% discounts still occurring," which is a question about the world. Directives expire and require re-confirmation, exactly like shared truth — because a rule whose reason has evaporated is worse than a stale number. The stale number misleads once. The dead rule keeps constraining people after the world that justified it is gone.

The system's role is strictly bounded: it may *prepare* any change — draft the CRM approval rule, complete and ready — but only the human who owns that tool may commit it. Two signatures on every implemented decision: the decision's owner signs the directive, the tool's owner commits its local form. The one exception is the layer-7 writeback, which stays automatic, and the exception defines the line exactly: correcting a record to match agreed truth is reconciliation; installing a rule about what humans must do is authority. The machine may write records into tools. Only humans may write obligations onto humans.

*The assumption to drop:* that since the system already has write access to the tools, it should just make the change itself.

Direct writeback is not a faster version of the human transaction. It is a different transaction that deletes every part of it — no author, no reasons where the affected person will meet them, no acknowledgment, no translation, no appeal. This is the same principle as layer 4, one level up. That layer says: we are never the source of truth, we only say which source won. This one says: we are never the source of authority, we only carry whose decision it is.

**Without it:** the company agrees on what is true, and then the decision leaves in a chat message and dies there — and the tools slowly fill with rules nobody can explain, that nobody dares delete, enforcing decisions nobody remembers making.

---

## What this means for how we sequence

The first four steps are what a customer feels immediately and pays for: their own tools, reconciled, with contradictions surfaced and settled out loud. That is sellable well before the rest exists.

Steps five through eight are what keeps them. They are also the ones that cannot be retrofitted — particularly step five, which has to be in place before a second person is ever added to an account. Adding it later is not an upgrade. It is a rebuild.

Step nine is what makes the system matter beyond answering questions. It can ship last — but like step five, it has one property that must exist before it is needed: the ownership model. Who may direct what domain has to be answerable from the first directive ever issued, because retrofitting authority onto commitments issued without it does not upgrade them. It invalidates them. The machinery can come late. The answer to "by what right?" cannot.

So the order is not a plan we chose. It is the order the problem comes in.
