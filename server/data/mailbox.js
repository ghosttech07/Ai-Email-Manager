// Sample mailbox used by the simulated Gmail / Outlook connections.
// Nothing here is pre-classified: every thread goes through the same AI pipeline a real
// synced email would. Dates are generated relative to "now" so the demo never looks stale.

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Thursday 19 November" for a date `offset` days from now. */
function dayLabel(now, offset) {
  const d = new Date(now);
  d.setDate(d.getDate() + offset);
  return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
}

export function buildMailbox({ now = new Date(), clientName, assistantName }) {
  const c = clientName.split(' ')[0];
  const a = assistantName.split(' ')[0];
  const day = (n) => dayLabel(now, n);

  const gmail = [
    {
      key: 'shoot',
      subject: 'Reschedule: winter collection product shoot',
      messages: [
        { from: ['Rohan Mehta', 'rohan@lightboxstudio.example'], h: 51, body:
`Hi ${a},

Our studio is double-booked this week, so I need to reschedule the winter collection shoot. Could we move it to ${day(3)} at 10:00 AM instead?

Same crew, same four-hour slot. Please confirm the new time and I'll resend the call sheet.

Thanks,
Rohan
Lightbox Studio` },
      ],
    },
    {
      key: 'gst',
      subject: `Q3 GST filing - ${c}'s sign-off needed`,
      messages: [
        { from: ['Priya Nair', 'priya@nairassociates.example'], h: 20, body:
`Dear ${c},

The Q3 GST return for Kiln & Co. is ready. The net liability comes to ₹2,14,600 after input credit. I need your sign-off before I can file, and the return is due by ${day(2)}.

I've attached the working. Please approve, or tell me if you want to walk through the numbers first.

Regards,
Priya Nair
Nair & Associates` },
      ],
    },
    {
      key: 'wholesale',
      subject: 'Wholesale terms for our 14 stores',
      messages: [
        { from: ['Farah Khan', 'farah.khan@thegoodstore.example'], h: 74, body:
`Hi ${c},

We'd love to stock the Monsoon range across all 14 stores from January.` },
        { from: [assistantName, 'office@kilnandco.example'], h: 70, out: true, body:
`Hi Farah,

Thank you - ${c} is delighted. I've attached the wholesale price list and minimum order quantities.

Best,
${a}` },
        { from: ['Farah Khan', 'farah.khan@thegoodstore.example'], h: 6, body:
`Hi ${c},

Thanks for the price list. Before we go further I need to hear from you directly on two things: would you accept 45-day payment terms, and are you open to a 12-month exclusivity clause for department stores?

These are commercial calls I'd rather not settle over a rate card, so your view matters here.

Warmly,
Farah Khan
Head of Buying, The Good Store` },
      ],
    },
    {
      key: 'paid',
      subject: 'Invoice INV-2291 paid by Clay Collective',
      read: true,
      messages: [
        { from: ['Zoho Books', 'no-reply@zohobooks.example'], h: 9, body:
`Payment received.

Clay Collective has paid invoice INV-2291 for ₹48,750. The amount will reflect in your bank account within two working days.

This is an automated notification. Please do not reply to this email.` },
      ],
    },
    {
      key: 'newsletter',
      subject: 'The Craft Economy: why small-batch is winning shelf space',
      read: true,
      messages: [
        { from: ['The Craft Economy', 'newsletter@crafteconomy.example'], h: 30, body:
`This week: how independent ceramics brands are winning shelf space, a founder's guide to export paperwork, and five studios to watch.

Read the full issue online. You are receiving this because you subscribed. Unsubscribe at any time.` },
      ],
    },
    {
      key: 'courier',
      subject: 'Updated rate card effective 1 December',
      messages: [
        { from: ['Arjun Rao', 'arjun.rao@swiftcourier.example'], h: 27, body:
`Hello,

Sharing our updated rate card, effective 1 December. Surface rates are unchanged; air shipments above 5 kg go up by 4%.

This is for your information only - no action needed on your side. Your account terms stay the same.

Regards,
Arjun Rao
Key Accounts, Swift Courier` },
      ],
    },
    {
      key: 'room',
      subject: 'Meeting room booking for the buyers\' preview',
      messages: [
        { from: ['Sneha Kulkarni', 'sneha@commonground.example'], h: 4, body:
`Hi ${a},

I'm holding the Terrace Room for the buyers' preview on ${day(6)} at 4:00 PM. Could you confirm the headcount and whether you need the projector?

I can only hold the slot until tomorrow evening.

Thanks,
Sneha
Common Ground Workspaces` },
      ],
    },
    {
      key: 'distributor',
      subject: 'Intro call: US distribution for Kiln & Co.',
      read: true,
      messages: [
        { from: ['Daniel Brooks', 'daniel@heathandhearth.example'], h: 98, body:
`Hi ${c},

We met briefly at Ambiente. Heath & Hearth distributes to about 200 independent homeware stores in the US and I think the Monsoon range would do well. Would you be up for an intro call?

Daniel` },
        { from: [assistantName, 'office@kilnandco.example'], h: 44, out: true, body:
`Hi Daniel,

${c} would be glad to talk. She is free on ${day(4)} at 9:30 AM IST or ${day(5)} at 6:00 PM IST - could you let me know which works better for you?

Best,
${a}
Office of ${clientName}` },
      ],
    },
    {
      key: 'interview',
      subject: 'Interview request: founders reshaping Indian craft',
      messages: [
        { from: ['Kavya Reddy', 'kavya.reddy@mintweekend.example'], h: 15, body:
`Hello,

I'm writing a feature on founders reshaping Indian craft and would love to include Kiln & Co. Would ${c} be open to a 30-minute interview next week?

I'm flexible on timing and happy to coordinate a slot around her calendar with her office.

Best,
Kavya Reddy
Mint Weekend` },
      ],
    },
    {
      key: 'investor',
      subject: 'Following up - thoughts on the term sheet?',
      messages: [
        { from: ['Vikram Shah', 'vikram@saffronventures.example'], h: 33, body:
`${c},

Good to see you last week. I wanted to follow up on the term sheet we sent over. I'd value your thoughts on the valuation and the board seat before our partners meet on ${day(5)}.

Happy to keep this between us until you've had time to think it through.

Vikram
Saffron Ventures` },
      ],
    },
    {
      key: 'returns',
      subject: 'Diwali returns exception for order #KC-10391',
      messages: [
        { from: ['Tanvi Joshi', 'tanvi@kilnandco.example'], h: 11, body:
`Hi both,

A customer wants to return a dinner set from order #KC-10391 bought 41 days ago, which is outside our 30-day policy. It was a Diwali gift. Can someone approve an exception, or should I decline?

Tanvi
Customer Care, Kiln & Co.` },
      ],
    },
    {
      key: 'packaging',
      subject: 'Sample boxes delivered',
      read: true,
      messages: [
        { from: ['Anita Desai', 'anita@greenwrap.example'], h: 60, body:
`Hi ${a},

The three sample boxes were delivered to the studio this morning. Could you confirm they arrived in good shape?

Anita` },
        { from: [assistantName, 'office@kilnandco.example'], h: 57, out: true, body:
`Hi Anita,

Received, thank you - all three arrived intact. ${c} will pick a finish this week.

Best,
${a}` },
        { from: ['Anita Desai', 'anita@greenwrap.example'], h: 56, body:
`Great, all set then. Thanks!

Anita` },
      ],
    },
    {
      key: 'calendar',
      subject: `Invitation: Quarterly review with Saffron Ventures`,
      read: true,
      messages: [
        { from: ['Google Calendar', 'calendar-notification@google.example'], h: 36, body:
`You have been invited to the following event.

Quarterly review with Saffron Ventures
When: ${day(5)} at 11:00 AM
Where: Saffron Ventures, Indiranagar

This is an automated notification from Google Calendar.` },
      ],
    },
    {
      key: 'chipped',
      subject: 'Order #KC-10482 arrived chipped',
      messages: [
        { from: ['Ishaan Verma', 'ishaan.verma@mailbox.example'], h: 2, body:
`Hello,

My order #KC-10482 arrived today and two of the six dinner plates are chipped. I've attached photos. Could you send a replacement or arrange a refund?

Thanks,
Ishaan` },
      ],
    },
    {
      key: 'settlement',
      subject: 'Settlement of ₹1,84,320 processed',
      read: true,
      messages: [
        { from: ['PayRail', 'notifications@payrail.example'], h: 13, body:
`Your settlement of ₹1,84,320 has been processed and will reach your account ending 4471 by tomorrow.

This is an automated notification. For questions, visit the help centre.` },
      ],
    },
    {
      key: 'offer',
      subject: 'Offer letter draft: studio manager',
      messages: [
        { from: ['Lakshmi Iyer', 'lakshmi@peoplefirst.example'], h: 23, body:
`Hi ${c},

The offer letter for the studio manager role is drafted. Before it goes out I need your approval on the compensation: ₹9.6 lakh fixed plus a 10% performance bonus.

The candidate has another offer, so I'd like to send this by ${day(1)}.

Lakshmi` },
      ],
    },
    {
      key: 'overdue',
      subject: 'Second reminder: invoice #47 is overdue',
      messages: [
        { from: ['Nikhil Bose', 'accounts@pixelloom.example'], h: 39, body:
`Hi ${a},

This is a second reminder that invoice #47 for the website refresh (₹62,000) is now 12 days overdue. Could you confirm the payment date?

Regards,
Nikhil Bose
Pixel Loom` },
      ],
    },
  ];

  const outlook = [
    {
      key: 'clinic',
      subject: 'Appointment reminder - please confirm or reschedule',
      messages: [
        { from: ['Aster Clinic', 'frontdesk@asterclinic.example'], h: 18, body:
`Dear ${clientName},

You have an appointment with Dr. Shalini Menon on ${day(2)} at 5:30 PM. Please confirm the appointment or reschedule by replying to this email.

Front Desk, Aster Clinic` },
      ],
    },
    {
      key: 'family',
      subject: "Amma's 70th - are you okay hosting?",
      messages: [
        { from: ['Aditi Raghavan', 'aditi.raghavan@mailbox.example'], h: 8, body:
`${c},

Amma's 70th birthday is on ${day(19)}. Are you okay hosting at your place, or should I book the club? I don't want to assume. Call me when you can.

Aditi` },
      ],
    },
    {
      key: 'board',
      subject: 'Board vote: scholarship fund allocation',
      messages: [
        { from: ['Design Alumni Board', 'secretary@designalumni.example'], h: 47, body:
`Dear board members,

The proposal to allocate ₹12 lakh to the craft scholarship fund is attached. As a board member, your vote is needed by ${day(4)}.

Please reply with Approve, Reject or Abstain.

Secretary, Design Alumni Board` },
      ],
    },
    {
      key: 'flight',
      subject: 'Your itinerary: Bengaluru to Delhi',
      read: true,
      messages: [
        { from: ['SkyJet', 'no-reply@skyjet.example'], h: 28, body:
`Your booking is confirmed.

Flight SJ 512, Bengaluru to Delhi, departing ${day(7)} at 6:40 AM. Booking reference QX7L2M.

This is an automated message. Please do not reply.` },
      ],
    },
    {
      key: 'school',
      subject: 'Parent-teacher meeting: pick a slot',
      messages: [
        { from: ['Greenfield School', 'office@greenfieldschool.example'], h: 25, body:
`Dear parent,

Parent-teacher meetings for Grade 4 are on ${day(8)}. Please pick a slot between 9:00 AM and 1:00 PM by replying to this email.

Parents are requested to attend personally.

School Office` },
      ],
    },
    {
      key: 'digest',
      subject: 'Your weekly network digest',
      read: true,
      messages: [
        { from: ['WorkLink', 'digest@worklink.example'], h: 52, body:
`12 people viewed your profile this week. See who is hiring in Design and Retail.

You are receiving this digest because of your notification settings. Unsubscribe.` },
      ],
    },
  ];

  // Emails that "arrive" when the assistant presses "Simulate new email".
  // Each shows the AI reconsidering: a waiting thread comes back, an unclear one resolves,
  // a request is withdrawn, and something lands straight on the client's desk.
  const incoming = [
    {
      replyTo: 'distributor',
      message: { from: ['Daniel Brooks', 'daniel@heathandhearth.example'], body:
`Hi ${a},

${day(4)} at 9:30 AM IST works for me. Could you send a calendar invite and a short agenda?

Daniel` },
    },
    {
      key: 'venue',
      account: 'gmail',
      subject: 'Venue hold for the launch dinner expires soon',
      message: { from: ['Meenal Kapoor', 'events@theterrace.example'], body:
`Dear ${c},

We are holding the Terrace for your launch dinner, but the hold expires on ${day(2)}. To keep the date I need your approval on the ₹1,50,000 deposit.

Shall I go ahead?

Meenal Kapoor
Events, The Terrace` },
    },
    {
      replyTo: 'interview',
      message: { from: ['Kavya Reddy', 'kavya.reddy@mintweekend.example'], body:
`Hi ${a},

Quick clarification - ${c} already said yes when we met at the design fair, so I only need to book a slot. Could you share her availability next week?

Kavya` },
    },
    {
      replyTo: 'shoot',
      message: { from: ['Rohan Mehta', 'rohan@lightboxstudio.example'], body:
`Hi ${a},

Never mind - the other booking moved, so the original date works after all. No change needed and no need to reply.

Rohan` },
    },
    {
      key: 'expo',
      account: 'gmail',
      subject: 'Stall allotment confirmed: Handmade Collective 2027',
      message: { from: ['Handmade Collective', 'updates@handmadecollective.example'], body:
`Your stall B-14 is confirmed for Handmade Collective 2027. The exhibitor kit will be emailed four weeks before the event.

This is an automated update. No action is required.` },
    },
  ];

  return { gmail, outlook, incoming };
}
