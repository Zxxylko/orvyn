# Implementation Tasks: ORVYN Phase 3 Enhancements

## Task Breakdown

### Backend Foundation

#### Task 1: Create FocusSession Model and Migration
**Status:** todo  
**Priority:** high  
**Estimated Time:** 30 minutes

**Description:**
Create the `focus_sessions` database table and Eloquent model for tracking Pomodoro sessions.

**Acceptance Criteria:**
- [ ] Migration creates `focus_sessions` table with UUID primary key
- [ ] Table includes: user_id, task_id (nullable), start_time, end_time, session_type
- [ ] Indexes on user_id+start_time and task_id
- [ ] FocusSession model with relationships to User and Task
- [ ] Casts for timestamps and session_type enum
- [ ] Migration runs successfully

**Files to Create/Modify:**
- `database/migrations/YYYY_MM_DD_create_focus_sessions_table.php`
- `app/Models/FocusSession.php`

---

#### Task 2: Create HealthMetricsService
**Status:** todo  
**Priority:** high  
**Estimated Time:** 45 minutes

**Description:**
Implement service for calculating burnout risk, stress level, and workload balance.

**Acceptance Criteria:**
- [ ] Service calculates burnout_risk (low/medium/high) based on task counts
- [ ] Service calculates stress_level (1-10) using formula from design
- [ ] Service calculates workload_balance (underloaded/balanced/overloaded)
- [ ] Methods accept User model and return structured array
- [ ] Results cached in Redis with 1-hour TTL
- [ ] Unit tests cover all calculation scenarios

**Files to Create/Modify:**
- `app/Services/HealthMetricsService.php`
- `tests/Unit/Services/HealthMetricsServiceTest.php`

---

#### Task 3: Create ValidationOverlapService
**Status:** todo  
**Priority:** high  
**Estimated Time:** 30 minutes

**Description:**
Implement service for detecting time block overlaps and conflicts.

**Acceptance Criteria:**
- [ ] hasOverlap() method detects overlapping time blocks
- [ ] getConflictingBlocks() returns array of conflicting blocks
- [ ] Routine blocks are excluded from overlap detection
- [ ] Method accepts excludeBlockId for update scenarios
- [ ] Unit tests cover edge cases (adjacent blocks, partial overlaps)

**Files to Create/Modify:**
- `app/Services/ValidationOverlapService.php`
- `tests/Unit/Services/ValidationOverlapServiceTest.php`

---

#### Task 4: Create ScheduleOptimizerService
**Status:** todo  
**Priority:** medium  
**Estimated Time:** 1 hour

**Description:**
Implement AI-powered schedule optimization with fallback logic.

**Acceptance Criteria:**
- [ ] generateSuggestions() analyzes tasks and returns time block suggestions
- [ ] Task scoring algorithm considers priority, deadline, difficulty
- [ ] findAvailableSlots() identifies free time periods
- [ ] Fallback optimization works without AI
- [ ] Returns suggestions with reasoning text
- [ ] Unit tests cover optimization scenarios

**Files to Create/Modify:**
- `app/Services/ScheduleOptimizerService.php`
- `tests/Unit/Services/ScheduleOptimizerServiceTest.php`

---

#### Task 5: Create TimeBlockController
**Status:** todo  
**Priority:** high  
**Estimated Time:** 45 minutes

**Description:**
Implement REST API endpoints for time block CRUD operations.

**Acceptance Criteria:**
- [ ] GET /api/v1/time-blocks with date range filtering
- [ ] POST /api/v1/time-blocks with validation
- [ ] PUT /api/v1/time-blocks/{id} with overlap checking
- [ ] DELETE /api/v1/time-blocks/{id}
- [ ] Sanctum authentication on all endpoints
- [ ] TimeBlockPolicy for authorization
- [ ] Validation prevents overlaps and invalid times
- [ ] Feature tests cover all endpoints

**Files to Create/Modify:**
- `app/Http/Controllers/Api/TimeBlockController.php`
- `app/Policies/TimeBlockPolicy.php`
- `routes/api.php`
- `tests/Feature/TimeBlockControllerTest.php`

---

#### Task 6: Create BriefingController
**Status:** todo  
**Priority:** high  
**Estimated Time:** 45 minutes

**Description:**
Implement API endpoints for daily AI briefings.

**Acceptance Criteria:**
- [ ] GET /api/v1/briefings/today returns cached briefing
- [ ] POST /api/v1/briefings/generate creates new briefing
- [ ] Integration with ClaudeService for AI generation
- [ ] Fallback briefing when AI unavailable
- [ ] Results cached in Redis with 24-hour TTL
- [ ] Feature tests cover both AI and fallback modes

**Files to Create/Modify:**
- `app/Http/Controllers/Api/BriefingController.php`
- `routes/api.php`
- `tests/Feature/BriefingControllerTest.php`

---

#### Task 7: Create HealthMetricsController
**Status:** todo  
**Priority:** medium  
**Estimated Time:** 20 minutes

**Description:**
Implement API endpoint for retrieving current health metrics.

**Acceptance Criteria:**
- [ ] GET /api/v1/health-metrics returns burnout risk and stress level
- [ ] Uses HealthMetricsService for calculations
- [ ] Results cached with 1-hour TTL
- [ ] Feature test covers endpoint

**Files to Create/Modify:**
- `app/Http/Controllers/Api/HealthMetricsController.php`
- `routes/api.php`
- `tests/Feature/HealthMetricsControllerTest.php`

---

#### Task 8: Create FocusSessionController
**Status:** todo  
**Priority:** medium  
**Estimated Time:** 30 minutes

**Description:**
Implement API endpoints for focus session tracking.

**Acceptance Criteria:**
- [ ] GET /api/v1/focus-sessions with date and task filtering
- [ ] POST /api/v1/focus-sessions to record completed sessions
- [ ] Pagination support (50 records per page)
- [ ] Feature tests cover CRUD operations

**Files to Create/Modify:**
- `app/Http/Controllers/Api/FocusSessionController.php`
- `routes/api.php`
- `tests/Feature/FocusSessionControllerTest.php`

---

#### Task 9: Create ScheduleOptimizerController
**Status:** todo  
**Priority:** low  
**Estimated Time:** 30 minutes

**Description:**
Implement API endpoint for schedule optimization suggestions.

**Acceptance Criteria:**
- [ ] POST /api/v1/schedule/optimize accepts date parameter
- [ ] Returns array of suggested time blocks with reasoning
- [ ] Uses ScheduleOptimizerService
- [ ] Feature test covers optimization

**Files to Create/Modify:**
- `app/Http/Controllers/Api/ScheduleOptimizerController.php`
- `routes/api.php`
- `tests/Feature/ScheduleOptimizerControllerTest.php`

---

#### Task 10: Create GenerateBriefingJob
**Status:** todo  
**Priority:** medium  
**Estimated Time:** 30 minutes

**Description:**
Implement background job for async briefing generation.

**Acceptance Criteria:**
- [ ] Job dispatches to Redis queue
- [ ] Generates briefing using ClaudeService
- [ ] Caches result in Redis
- [ ] Persists to database
- [ ] Handles failures gracefully

**Files to Create/Modify:**
- `app/Jobs/GenerateBriefingJob.php`
- `tests/Unit/Jobs/GenerateBriefingJobTest.php`

---

#### Task 11: Create RecalculateHealthMetricsJob
**Status:** todo  
**Priority:** low  
**Estimated Time:** 20 minutes

**Description:**
Implement background job triggered on task changes.

**Acceptance Criteria:**
- [ ] Job dispatches when tasks created/updated/completed
- [ ] Recalculates health metrics
- [ ] Updates Redis cache
- [ ] Handles failures gracefully

**Files to Create/Modify:**
- `app/Jobs/RecalculateHealthMetricsJob.php`
- `tests/Unit/Jobs/RecalculateHealthMetricsJobTest.php`

---

### Frontend Components

#### Task 12: Create TimeBlock TypeScript Types
**Status:** todo  
**Priority:** high  
**Estimated Time:** 15 minutes

**Description:**
Define TypeScript interfaces for time blocks and related types.

**Acceptance Criteria:**
- [ ] TimeBlock interface matches API response
- [ ] BlockType enum defined
- [ ] ScheduleSuggestion interface defined
- [ ] Types exported from central location

**Files to Create/Modify:**
- `frontend/src/types/timeblock.ts`

---

#### Task 13: Create FocusSession TypeScript Types
**Status:** todo  
**Priority:** medium  
**Estimated Time:** 10 minutes

**Description:**
Define TypeScript interfaces for focus sessions.

**Acceptance Criteria:**
- [ ] FocusSession interface matches API response
- [ ] SessionType enum defined
- [ ] Types exported

**Files to Create/Modify:**
- `frontend/src/types/focusSession.ts`

---

#### Task 14: Create AIBriefing TypeScript Types
**Status:** todo  
**Priority:** high  
**Estimated Time:** 10 minutes

**Description:**
Define TypeScript interfaces for briefings and health metrics.

**Acceptance Criteria:**
- [ ] AIBriefing interface matches API response
- [ ] HealthMetrics interface defined
- [ ] Types exported

**Files to Create/Modify:**
- `frontend/src/types/briefing.ts`

---

#### Task 15: Extend API Client with Phase 3 Endpoints
**Status:** todo  
**Priority:** high  
**Estimated Time:** 30 minutes

**Description:**
Add API methods for time blocks, briefings, health metrics, and focus sessions.

**Acceptance Criteria:**
- [ ] timeBlockApi methods (get, create, update, delete)
- [ ] briefingApi methods (getToday, generate)
- [ ] healthMetricsApi.get() method
- [ ] focusSessionApi methods (get, create)
- [ ] scheduleApi.optimize() method
- [ ] All methods typed with TypeScript

**Files to Create/Modify:**
- `frontend/src/lib/api.ts`

---

#### Task 16: Create useTimeBlocks Hook
**Status:** todo  
**Priority:** high  
**Estimated Time:** 45 minutes

**Description:**
Custom React hook for time block state management.

**Acceptance Criteria:**
- [ ] Fetches time blocks for date range
- [ ] createTimeBlock() with optimistic updates
- [ ] updateTimeBlock() with overlap validation
- [ ] deleteTimeBlock() with confirmation
- [ ] Loading and error states
- [ ] Toast notifications

**Files to Create/Modify:**
- `frontend/src/hooks/useTimeBlocks.ts`

---

#### Task 17: Create useBriefing Hook
**Status:** todo  
**Priority:** high  
**Estimated Time:** 30 minutes

**Description:**
Custom React hook for daily briefing data.

**Acceptance Criteria:**
- [ ] Fetches today's briefing on mount
- [ ] refresh() method to regenerate
- [ ] Loading and error states
- [ ] Caches result locally

**Files to Create/Modify:**
- `frontend/src/hooks/useBriefing.ts`

---

#### Task 18: Create useHealthMetrics Hook
**Status:** todo  
**Priority:** medium  
**Estimated Time:** 20 minutes

**Description:**
Custom React hook for health metrics polling.

**Acceptance Criteria:**
- [ ] Fetches metrics on mount
- [ ] Polls every 5 minutes for updates
- [ ] Returns burnout risk and stress level
- [ ] Loading state

**Files to Create/Modify:**
- `frontend/src/hooks/useHealthMetrics.ts`

---

#### Task 19: Create useFocusTimer Hook
**Status:** todo  
**Priority:** medium  
**Estimated Time:** 1 hour

**Description:**
Custom React hook for Pomodoro timer logic.

**Acceptance Criteria:**
- [ ] Manages timer state (work/break/long break)
- [ ] Countdown logic with setInterval
- [ ] start(), pause(), skip() methods
- [ ] Session count tracking (1-4)
- [ ] Notification on completion
- [ ] Persists completed sessions to API

**Files to Create/Modify:**
- `frontend/src/hooks/useFocusTimer.ts`

---

#### Task 20: Create TimeBlockCard Component
**Status:** todo  
**Priority:** high  
**Estimated Time:** 45 minutes

**Description:**
Visual card component for individual time blocks.

**Acceptance Criteria:**
- [ ] Displays label, time range, task title
- [ ] Color-coded by block_type
- [ ] Shows lock icon if is_locked
- [ ] Glassmorphism styling
- [ ] Hover effects
- [ ] Responsive design

**Files to Create/Modify:**
- `frontend/src/components/calendar/TimeBlockCard.tsx`

---

#### Task 21: Create CalendarView Component
**Status:** todo  
**Priority:** high  
**Estimated Time:** 2 hours

**Description:**
Main calendar component with daily/weekly views.

**Acceptance Criteria:**
- [ ] Renders time blocks positioned by start_time
- [ ] Time labels on vertical axis (00:00-23:59)
- [ ] Current time marker
- [ ] Daily and weekly view modes
- [ ] Drag-and-drop support with Framer Motion
- [ ] Overlap validation feedback
- [ ] Responsive layout
- [ ] Glassmorphism styling

**Files to Create/Modify:**
- `frontend/src/components/calendar/CalendarView.tsx`

---

#### Task 22: Create DailyBriefing Component
**Status:** todo  
**Priority:** high  
**Estimated Time:** 45 minutes

**Description:**
Component displaying AI-generated daily briefing.

**Acceptance Criteria:**
- [ ] Shows summary text prominently
- [ ] Renders health metrics with visual indicators
- [ ] Displays recommended adjustments as list
- [ ] Refresh button
- [ ] Loading skeleton
- [ ] Degraded mode notice
- [ ] Glassmorphism styling

**Files to Create/Modify:**
- `frontend/src/components/dashboard/DailyBriefing.tsx`

---

#### Task 23: Create BurnoutGauge Component
**Status:** todo  
**Priority:** high  
**Estimated Time:** 1 hour

**Description:**
Visual gauge component for burnout risk.

**Acceptance Criteria:**
- [ ] Radial gauge visualization
- [ ] Color-coded (green/yellow/red)
- [ ] Displays numeric stress level
- [ ] Warning text for high risk
- [ ] Animated transitions
- [ ] Responsive sizing
- [ ] Glassmorphism styling

**Files to Create/Modify:**
- `frontend/src/components/dashboard/BurnoutGauge.tsx`

---

#### Task 24: Create FocusTimer Component
**Status:** todo  
**Priority:** medium  
**Estimated Time:** 1.5 hours

**Description:**
Pomodoro timer component with controls.

**Acceptance Criteria:**
- [ ] Countdown display (MM:SS)
- [ ] Start, pause, skip buttons
- [ ] Task selector dropdown
- [ ] Session count indicator (1-4)
- [ ] Notification sound on completion
- [ ] Visual state changes (work/break)
- [ ] Glassmorphism styling

**Files to Create/Modify:**
- `frontend/src/components/dashboard/FocusTimer.tsx`

---

#### Task 25: Create SessionHistory Component
**Status:** todo  
**Priority:** low  
**Estimated Time:** 45 minutes

**Description:**
Component displaying completed focus sessions.

**Acceptance Criteria:**
- [ ] Lists sessions with date, task, duration
- [ ] Daily/weekly totals
- [ ] Pagination (50 per page)
- [ ] Filter by task
- [ ] Glassmorphism styling

**Files to Create/Modify:**
- `frontend/src/components/dashboard/SessionHistory.tsx`

---

#### Task 26: Create CalendarPage
**Status:** todo  
**Priority:** high  
**Estimated Time:** 30 minutes

**Description:**
Page component integrating calendar view.

**Acceptance Criteria:**
- [ ] Renders CalendarView component
- [ ] Date picker for navigation
- [ ] View mode toggle (daily/weekly)
- [ ] Optimize schedule button
- [ ] Responsive layout

**Files to Create/Modify:**
- `frontend/src/pages/CalendarPage.tsx`

---

#### Task 27: Update DashboardPage with Phase 3 Components
**Status:** todo  
**Priority:** high  
**Estimated Time:** 30 minutes

**Description:**
Integrate briefing, burnout gauge, and focus timer into dashboard.

**Acceptance Criteria:**
- [ ] DailyBriefing component at top
- [ ] BurnoutGauge in sidebar or header
- [ ] FocusTimer accessible from dashboard
- [ ] Maintains existing task matrix
- [ ] Responsive grid layout

**Files to Create/Modify:**
- `frontend/src/pages/DashboardPage.tsx`

---

#### Task 28: Add Calendar Route to App
**Status:** todo  
**Priority:** medium  
**Estimated Time:** 10 minutes

**Description:**
Add calendar page to React Router configuration.

**Acceptance Criteria:**
- [ ] /calendar route added
- [ ] Protected route with auth
- [ ] Navigation link in sidebar/header

**Files to Create/Modify:**
- `frontend/src/App.tsx`

---

### Integration & Testing

#### Task 29: End-to-End Testing - Time Blocks
**Status:** todo  
**Priority:** medium  
**Estimated Time:** 1 hour

**Description:**
Test complete time block workflow from frontend to backend.

**Acceptance Criteria:**
- [ ] Create time block via UI
- [ ] Drag-and-drop repositioning
- [ ] Overlap validation prevents conflicts
- [ ] Delete time block
- [ ] Data persists correctly

---

#### Task 30: End-to-End Testing - Daily Briefing
**Status:** todo  
**Priority:** medium  
**Estimated Time:** 30 minutes

**Description:**
Test briefing generation and display.

**Acceptance Criteria:**
- [ ] Briefing generates on page load
- [ ] Health metrics display correctly
- [ ] Refresh button works
- [ ] Fallback mode activates without API key

---

#### Task 31: End-to-End Testing - Focus Timer
**Status:** todo  
**Priority:** low  
**Estimated Time:** 30 minutes

**Description:**
Test Pomodoro timer functionality.

**Acceptance Criteria:**
- [ ] Timer counts down correctly
- [ ] Session completes and records to API
- [ ] Break timer activates after work session
- [ ] Long break after 4 sessions

---

#### Task 32: Performance Testing
**Status:** todo  
**Priority:** low  
**Estimated Time:** 1 hour

**Description:**
Test performance of Phase 3 features under load.

**Acceptance Criteria:**
- [ ] Calendar renders 50+ time blocks smoothly
- [ ] API responses under 200ms
- [ ] Redis caching working correctly
- [ ] No memory leaks in timer

---

### Documentation

#### Task 33: Update API Documentation
**Status:** todo  
**Priority:** low  
**Estimated Time:** 30 minutes

**Description:**
Document all Phase 3 API endpoints.

**Acceptance Criteria:**
- [ ] Endpoint descriptions
- [ ] Request/response examples
- [ ] Error codes documented

**Files to Create/Modify:**
- `backend/README.md`

---

#### Task 34: Update Frontend README
**Status:** todo  
**Priority:** low  
**Estimated Time:** 20 minutes

**Description:**
Document new components and hooks.

**Acceptance Criteria:**
- [ ] Component usage examples
- [ ] Hook API documentation
- [ ] Integration guide

**Files to Create/Modify:**
- `frontend/README.md`

---

#### Task 35: Create Phase 3 User Guide
**Status:** todo  
**Priority:** low  
**Estimated Time:** 30 minutes

**Description:**
Write user-facing documentation for Phase 3 features.

**Acceptance Criteria:**
- [ ] Calendar usage guide
- [ ] Briefing explanation
- [ ] Focus timer instructions
- [ ] Screenshots/GIFs

**Files to Create/Modify:**
- `PHASE_3_USER_GUIDE.md`

---

## Task Summary

**Total Tasks:** 35  
**Estimated Total Time:** ~20 hours

**By Priority:**
- High: 15 tasks (~9 hours)
- Medium: 13 tasks (~8 hours)
- Low: 7 tasks (~3 hours)

**By Category:**
- Backend: 11 tasks (~7 hours)
- Frontend: 17 tasks (~11 hours)
- Testing: 4 tasks (~3 hours)
- Documentation: 3 tasks (~1.5 hours)

**Recommended Implementation Order:**
1. Backend foundation (Tasks 1-11)
2. Frontend types and API client (Tasks 12-15)
3. Frontend hooks (Tasks 16-19)
4. Frontend components (Tasks 20-25)
5. Page integration (Tasks 26-28)
6. Testing (Tasks 29-32)
7. Documentation (Tasks 33-35)
