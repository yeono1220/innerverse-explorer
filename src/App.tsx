import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import NotFound from "./pages/NotFound";

import { AppShell } from "./app/AppShell";
import { TabShell } from "./app/TabShell";
import Splash from "./app/screens/Splash";
import Login from "./app/screens/Login";
import Signup from "./app/screens/Signup";
import Home from "./app/screens/Home";
import DiaryList from "./app/screens/DiaryList";
import WeeklyReview from "./app/screens/WeeklyReview";
import Settings from "./app/screens/Settings";
import DiaryWrite from "./app/screens/DiaryWrite";
import EmotionResult from "./app/screens/EmotionResult";
import DiaryDetail from "./app/screens/DiaryDetail";
import Empty from "./app/screens/Empty";
import MomoChat from "./app/screens/MomoChat.tsx";
import DiaryComplete from "./app/screens/DiaryComplete";
import Attendance from "./app/screens/Attendance";
import Quest from "./app/screens/Quest";
import Condition from "./app/screens/Condition";
import Inventory from "./app/screens/Inventory";
import LevelUp from "./app/screens/LevelUp";
import Galaxy from "./app/screens/Galaxy";
import FriendPlanet from "./app/screens/FriendPlanet";
import PastLetter from "./app/screens/PastLetter";
import AddFriend from "./app/screens/AddFriend";
import Notifications from "./app/screens/Notifications";
import Search from "./app/screens/Search";
import Calendar from "./app/screens/Calendar";
import Memory from "./app/screens/Memory";
import BranchGallery from "./app/screens/BranchGallery";
import AvatarJourney from "./app/screens/AvatarJourney";
import { DioramaScene } from "./diorama/DioramaScene";
import Landing from "./pages/Landing";
import { AuthBootstrap } from "./app/AuthBootstrap";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthBootstrap />
      <BrowserRouter>
        <Routes>
          {/* 폰 프레임 셸 (대부분의 화면) */}
          <Route element={<AppShell />}>
            <Route path="/" element={<Splash />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />

            {/* 하단 탭이 있는 메인 4화면 */}
            <Route element={<TabShell />}>
              <Route path="/home" element={<Home />} />
              <Route path="/diary" element={<DiaryList />} />
              <Route path="/review" element={<WeeklyReview />} />
              <Route path="/me" element={<Settings />} />
            </Route>

            {/* 일기 스택 */}
            <Route path="/diary/write" element={<DiaryWrite />} />
            <Route path="/diary/empty" element={<Empty />} />
            <Route path="/diary/result/:id" element={<EmotionResult />} />
            <Route path="/diary/:id" element={<DiaryDetail />} />

            {/* 모모 대화 스택 */}
            <Route path="/momo/chat" element={<MomoChat />} />
            <Route path="/momo/complete" element={<DiaryComplete />} />

            {/* 게이미피케이션 */}
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/quest" element={<Quest />} />
            <Route path="/condition" element={<Condition />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/levelup" element={<LevelUp />} />

            {/* 탐험 */}
            <Route path="/galaxy" element={<Galaxy />} />
            <Route path="/friend/add" element={<AddFriend />} />
            <Route path="/friend/:id" element={<FriendPlanet />} />
            <Route path="/letter" element={<PastLetter />} />

            {/* 유틸리티 */}
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/search" element={<Search />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/memory" element={<Memory />} />

            {/* 5분기 갤러리 */}
            <Route path="/branches" element={<BranchGallery />} />

            {/* 모모 7일 성장기 미리보기 */}
            <Route path="/avatar/journey" element={<AvatarJourney />} />
          </Route>

          {/* 소혹성 디오라마 (자체 폰 프레임 포함). 글래스 모모 코드는 보존되어 있고 라우트 진입점만 디오라마로 교체됨. */}
          <Route path="/glass" element={<DioramaScene />} />
          {/* 피치/랜딩 페이지 (폰 프레임 없는 풀 마케팅 페이지) */}
          <Route path="/pitch" element={<Landing />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
