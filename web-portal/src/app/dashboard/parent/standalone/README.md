# Standalone Parent Dashboard

**Route**: `/dashboard/parent/standalone`

## Purpose

This dashboard is for **independent/standalone parents** who:
- ❌ Are NOT affiliated with any school or preschool (`preschool_id` IS NULL)
- ✅ Pay for individual subscriptions (Parent Starter R49.99 or Parent Plus R149.99)
- ✅ Use the app for self-study and exam preparation
- ✅ Don't have access to school features (messages, attendance, fees, school calendar)

## User Detection

Users are routed here if:
```typescript
profile.preschool_id === null && profile.role === 'parent'
```

## Subscription Tiers

### Free (R0)
- 10 AI Homework Helper queries/month
- Basic progress tracking
- Exam prep access

### Parent Starter (R49.99/month)
- 30 AI Homework Helper queries/month
- Full progress tracking (1 child)
- Priority AI processing
- Email support

### Parent Plus (R149.99/month)
- 100 AI Homework Helper queries/month
- Progress tracking (up to 3 children)
- Advanced insights
- Priority support
- WhatsApp Connect
- Learning resources

## Features Included

✅ **Available:**
- AI Homework Helper (quota-based)
- Exam Prep Generator (CAPS-aligned)
- CAPS Activities Widget
- Progress tracking
- Study streak tracking
- Subscription management
- Upgrade prompts

❌ **Not Available:**
- School messages (no teachers to message)
- School calendar (no school events)
- Attendance tracking (no school)
- Fee payments (no school fees)
- School announcements
- Class assignments (only AI-generated)

## Key Components Used

1. **CAPSActivitiesWidget** - Educational activities by age/grade
2. **ExamPrepWidget** - Generate practice tests, revision notes, flashcards
3. **AskAIWidget** - AI assistant modal
4. Usage stats (homework helps, exam preps, study streak)
5. Child selector (for multi-child families)

## Upgrade Flow

**Free → Parent Starter:**
- Prominent banner at top
- CTA in quick actions
- Quota warnings when limit reached

**Parent Starter → Parent Plus:**
- Featured card in main content
- Highlights: 100 queries, 3 children, advanced features

## TODO

- [ ] Fetch real AI usage stats from `ai_usage_logs` table
- [ ] Implement study streak calculation
- [ ] Add progress charts/graphs
- [ ] Connect to payment gateway (Payfast)
- [ ] Add child registration flow for standalone parents
- [ ] Implement learning resources library
- [ ] Add WhatsApp Connect feature

## Related Files

- Main affiliated dashboard: `/dashboard/parent/page.tsx`
- User type detection: (to be implemented in Phase 2)
- Subscription components: (to be implemented)

---

**Last Updated**: 2025-11-02  
**Status**: ✅ Initial Implementation Complete
