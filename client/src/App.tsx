import FavPage from "@/pages/fav";
import AshiPage from "@/pages/ashi";
import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Shell } from "@/components/shell";
import PicksPage from "@/pages/picks";
import { VenueList, RaceDetail } from "@/pages/race";
import MyPage from "@/pages/my";
import RacerPage from "@/pages/racer";
import BacktestPage from "@/pages/backtest";
import TeppanPage from "@/pages/teppan";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={PicksPage} />
      <Route path="/race" component={VenueList} />
      <Route path="/race/:hd/:jcd/:rno">
        {(p) => <RaceDetail key={`${p.hd}-${p.jcd}-${p.rno}`} hd={p.hd} jcd={p.jcd} rno={parseInt(p.rno)} />}
      </Route>
      <Route path="/my" component={MyPage} />
      <Route path="/racer">{() => <RacerPage />}</Route>
      <Route path="/racer/:toban">{(p) => <RacerPage key={p.toban} toban={p.toban} />}</Route>
      <Route path="/backtest" component={BacktestPage} />
      <Route path="/fav" component={FavPage} />
      <Route path="/ashi" component={AshiPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocation}>
          <Switch>
            <Route path="/teppan" component={TeppanPage} />
            <Route>
              <Shell>
                <AppRouter />
              </Shell>
            </Route>
          </Switch>
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
