import React, { useEffect, useState } from 'react';
import {
  Trophy,
  DollarSign,
  Flame,
  Sparkles,
  CalendarClock,
  UsersRound
} from 'lucide-react';
import { BracketMatch, Team, Tournament, TournamentMatch, UserRole } from '../../types';
import { TabId } from '../shell/Sidebar';
import { tournamentXApi } from '../../services/apiClient';

interface GroupStandingRow {
  participantId: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  scoreFor: number;
  scoreAgainst: number;
  points: number;
}

interface GroupMatch {
  id: string;
  groupId: string;
  round: number;
  team1: { id: string; name: string; score: number };
  team2: { id: string; name: string; score: number };
  status: 'FINISHED' | 'SCHEDULED';
}

interface TournamentGroup {
  id: string;
  name: string;
  standings: GroupStandingRow[];
  matches: GroupMatch[];
}

interface TournamentParticipant {
  id: string;
  name: string;
  seed: number;
}

type EditableMatch = BracketMatch | GroupMatch;

interface TournamentsViewProps {
  onNavigate: (tab: TabId, targetId?: string) => void;
  currentUserRole: UserRole;
  onOpenCreateWizard: () => void;
  tournaments: Tournament[];
  teams: Team[];
  onReportBracketResult: (tournamentId: string, matchId: string, score1: number, score2: number) => Promise<void> | void;
  onRegisterParticipant: (tournamentId: string, data: { teamId?: string; teamName: string; seed?: number }) => Promise<void> | void;
  onGenerateGroups: (tournamentId: string, groupCount: number) => Promise<void> | void;
  onGenerateBracket: (tournamentId: string) => Promise<void> | void;
  onChangeStatus: (tournamentId: string, status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'PUBLISHED' | 'IN_PROGRESS' | 'COMPLETED', note?: string) => Promise<void> | void;
}

export const TournamentsView: React.FC<TournamentsViewProps> = ({
  onNavigate,
  currentUserRole,
  onOpenCreateWizard,
  tournaments,
  teams,
  onReportBracketResult,
  onRegisterParticipant,
  onGenerateGroups,
  onGenerateBracket,
  onChangeStatus,
}) => {
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | undefined>(tournaments[0]?.id);
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'BRACKET' | 'MATCHES' | 'STANDINGS'>('OVERVIEW');

  const [selectedMatch, setSelectedMatch] = useState<EditableMatch | null>(null);
  const [selectedMatchKind, setSelectedMatchKind] = useState<'knockout' | 'group' | null>(null);
  const [tempScore1, setTempScore1] = useState<number>(0);
  const [tempScore2, setTempScore2] = useState<number>(0);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [isSavingScore, setIsSavingScore] = useState(false);

  const [groups, setGroups] = useState<TournamentGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);

  const [participants, setParticipants] = useState<TournamentParticipant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);

  const [newParticipantTeamId, setNewParticipantTeamId] = useState('');
  const [newParticipantSeed, setNewParticipantSeed] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const [groupCountInput, setGroupCountInput] = useState('2');
  const [isGeneratingGroups, setIsGeneratingGroups] = useState(false);
  const [generateGroupsError, setGenerateGroupsError] = useState<string | null>(null);

  const [isGeneratingBracket, setIsGeneratingBracket] = useState(false);
  const [generateBracketError, setGenerateBracketError] = useState<string | null>(null);
  const [flowMatches, setFlowMatches] = useState<TournamentMatch[]>([]);
  const [flowSchedules, setFlowSchedules] = useState<Array<{ id: string; tournamentId: string; startsAt: string; status: string }>>([]);
  const [scheduleStart, setScheduleStart] = useState(() => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16));
  const [scheduleVenue, setScheduleVenue] = useState('Arena TournamentX');
  const [scheduleMode, setScheduleMode] = useState<'best_of_1' | 'best_of_3' | 'best_of_5'>('best_of_3');
  const [isScheduling, setIsScheduling] = useState(false);
  const [flowMessage, setFlowMessage] = useState('');
  const [audit, setAudit] = useState<Array<{ id: string; previousStatus: string; nextStatus: string; changedBy: string; note?: string; createdAt: string }>>([]);
  const [isChangingStatus, setIsChangingStatus] = useState(false);

  const selectedTournament = tournaments.find((t) => t.id === selectedTournamentId) || tournaments[0];

  const canManageTournament = currentUserRole === 'Admin' || currentUserRole === 'Organizador';
  const canEditScores = currentUserRole === 'Admin' || currentUserRole === 'Organizador' || currentUserRole === 'Árbitro';

  const loadGroups = async (tournamentId: string) => {
    setGroupsLoading(true);
    try {
      const data = await tournamentXApi.tournamentGroups(tournamentId);
      setGroups(data as TournamentGroup[]);
    } catch {
      setGroups([]);
    } finally {
      setGroupsLoading(false);
    }
  };

  const loadParticipants = async (tournamentId: string) => {
    setParticipantsLoading(true);
    try {
      const data = await tournamentXApi.tournamentParticipants(tournamentId);
      setParticipants(data as TournamentParticipant[]);
    } catch {
      setParticipants([]);
    } finally {
      setParticipantsLoading(false);
    }
  };

  const loadFlowState = async (tournamentId: string) => {
    const [matchesResult, schedulesResult] = await Promise.allSettled([
      tournamentXApi.matches(tournamentId),
      tournamentXApi.schedules(tournamentId),
    ]);
    setFlowMatches(matchesResult.status === 'fulfilled' ? matchesResult.value : []);
    setFlowSchedules(schedulesResult.status === 'fulfilled' ? schedulesResult.value : []);
  };

  useEffect(() => {
    if (!selectedTournament || selectedTournament.format !== 'GROUP_STAGE_PLAYOFFS') {
      setGroups([]);
      return;
    }
    if (activeTab !== 'STANDINGS' && activeTab !== 'MATCHES') return;
    loadGroups(selectedTournament.id);
  }, [activeTab, selectedTournament?.id, selectedTournament?.format]);

  useEffect(() => {
    if (!selectedTournament) return;
    void loadParticipants(selectedTournament.id);
    void loadFlowState(selectedTournament.id);
    if (canManageTournament) tournamentXApi.tournamentAudit(selectedTournament.id).then((value) => setAudit(value as typeof audit)).catch(() => setAudit([]));
    setFlowMessage('');
  }, [selectedTournament?.id]);

  const nextStatuses: Record<string, Array<'DRAFT' | 'OPEN' | 'CLOSED' | 'PUBLISHED' | 'IN_PROGRESS' | 'COMPLETED'>> = {
    DRAFT: ['OPEN'], OPEN: ['CLOSED', 'IN_PROGRESS'], CLOSED: ['OPEN', 'PUBLISHED'],
    PUBLISHED: ['IN_PROGRESS'], IN_PROGRESS: ['COMPLETED'], COMPLETED: [],
  };

  const changeStatus = async (status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'PUBLISHED' | 'IN_PROGRESS' | 'COMPLETED') => {
    if (!selectedTournament) return;
    setIsChangingStatus(true); setFlowMessage('');
    try {
      await onChangeStatus(selectedTournament.id, status, `Cambio realizado desde el panel de competición`);
      const entries = await tournamentXApi.tournamentAudit(selectedTournament.id);
      setAudit(entries as typeof audit);
      setFlowMessage(`Estado actualizado a ${status}.`);
    } catch (error) { setFlowMessage(error instanceof Error ? error.message : 'No se pudo cambiar el estado.'); }
    finally { setIsChangingStatus(false); }
  };

  const handleOpenMatch = (match: EditableMatch, kind: 'knockout' | 'group') => {
    setSelectedMatch(match);
    setSelectedMatchKind(kind);
    setTempScore1(match.team1.score);
    setTempScore2(match.team2.score);
    setScoreError(null);
  };

  const handleSaveScore = async () => {
    if (!selectedMatch || !selectedTournament || !selectedMatchKind) return;
    setScoreError(null);
    setIsSavingScore(true);
    try {
      if (selectedMatchKind === 'knockout') {
        await onReportBracketResult(selectedTournament.id, selectedMatch.id, tempScore1, tempScore2);
      } else {
        await tournamentXApi.reportGroupMatchResult(selectedTournament.id, selectedMatch.id, tempScore1, tempScore2);
        await loadGroups(selectedTournament.id);
      }
      setSelectedMatch(null);
      setSelectedMatchKind(null);
    } catch (error) {
      setScoreError(error instanceof Error ? error.message : 'No se pudo guardar el resultado.');
    } finally {
      setIsSavingScore(false);
    }
  };

  const handleAddParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    const team = teams.find((item) => item.id === newParticipantTeamId);
    if (!selectedTournament || !team) return;
    setIsRegistering(true);
    setRegisterError(null);
    try {
      await onRegisterParticipant(selectedTournament.id, {
        teamId: team.id,
        teamName: team.name,
        seed: newParticipantSeed ? Number(newParticipantSeed) : undefined,
      });
      setNewParticipantTeamId('');
      setNewParticipantSeed('');
      await loadParticipants(selectedTournament.id);
    } catch (error) {
      setRegisterError(error instanceof Error ? error.message : 'No se pudo inscribir al participante.');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleGenerateGroupsClick = async () => {
    if (!selectedTournament) return;
    setIsGeneratingGroups(true);
    setGenerateGroupsError(null);
    try {
      await onGenerateGroups(selectedTournament.id, Number(groupCountInput) || 2);
      await loadGroups(selectedTournament.id);
    } catch (error) {
      setGenerateGroupsError(error instanceof Error ? error.message : 'No se pudieron generar los grupos.');
    } finally {
      setIsGeneratingGroups(false);
    }
  };

  const handleGenerateBracketClick = async () => {
    if (!selectedTournament) return;
    setIsGeneratingBracket(true);
    setGenerateBracketError(null);
    try {
      await onGenerateBracket(selectedTournament.id);
      await loadFlowState(selectedTournament.id);
    } catch (error) {
      setGenerateBracketError(error instanceof Error ? error.message : 'No se pudo generar el bracket.');
    } finally {
      setIsGeneratingBracket(false);
    }
  };

  const handleCreateSchedule = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTournament || participants.length < 2) return;
    setIsScheduling(true); setFlowMessage('');
    try {
      const result = await tournamentXApi.createSchedule({
        tournamentId: selectedTournament.id,
        teamIds: participants.map((participant) => participant.id),
        startsAt: new Date(scheduleStart).toISOString(),
        slotMinutes: 90,
        venue: scheduleVenue || selectedTournament.venue || 'Online',
        mode: scheduleMode,
        format: selectedTournament.format === 'SINGLE_ELIMINATION' ? 'single_elimination' : 'round_robin',
      });
      await loadFlowState(selectedTournament.id);
      setFlowMessage(`Calendario publicado con ${result.matches.length} partido${result.matches.length === 1 ? '' : 's'}.`);
    } catch (error) {
      setFlowMessage(error instanceof Error ? error.message : 'No se pudo programar el calendario.');
    } finally { setIsScheduling(false); }
  };

  if (!selectedTournament) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto text-center text-sm text-slate-400">
        Todavía no hay torneos creados.
        {canManageTournament ? <button
          onClick={onOpenCreateWizard}
          className="block mx-auto mt-4 px-4 py-2 rounded-xl bg-gradient-to-r from-[#ff2e83] to-[#e11d48] text-white text-xs font-bold tracking-wide shadow-md shadow-[#ff2e83]/20 hover:scale-105 transition-all cursor-pointer"
        >
          ＋ CREAR NUEVO TORNEO
        </button> : <p className="mt-4 text-xs text-slate-500">Inicia sesión como organizador para publicar un torneo.</p>}
      </div>
    );
  }

  const rounds = selectedTournament.rounds || [];
  const availableTeams = teams.filter((team) => team.status !== 'inactive' && !participants.some((participant) => participant.id === team.id));
  const hasParticipants = participants.length >= 2;
  const hasBracket = rounds.length > 0;
  const hasSchedule = flowSchedules.length > 0 || flowMatches.length > 0;
  const completedMatches = flowMatches.filter((match) => match.status === 'completed').length;
  const bracketMatches = rounds.flatMap((round) => round.matches);
  const completedBracketMatches = bracketMatches.filter((match) => match.status === 'FINISHED').length;
  const bracketProgress = bracketMatches.length ? Math.round((completedBracketMatches / bracketMatches.length) * 100) : 0;
  const allGroupMatchesFinished = groups.length > 0
    && groups.every((group) => group.matches.length > 0 && group.matches.every((m) => m.status === 'FINISHED'));

  return (
    <div id="tournaments-view-container" className="mx-auto max-w-7xl space-y-6 p-4 sm:space-y-8 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Torneos
        </h1>

        {canManageTournament && <button
          onClick={onOpenCreateWizard}
          className="self-start rounded-xl bg-gradient-to-r from-[#ff2e83] to-[#e11d48] px-4 py-2 text-xs font-bold tracking-wide text-white shadow-md shadow-[#ff2e83]/20 transition-all hover:scale-105 sm:self-auto cursor-pointer"
        >
          ＋ CREAR NUEVO TORNEO
        </button>}
      </header>

      {/* Tournament Selector Dropdown / Pills */}
      <div className="flex flex-col gap-2 rounded-2xl border border-[#1e2230] bg-[#10121a] p-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <span className="shrink-0 text-xs font-mono-code uppercase font-bold text-slate-400">Torneo Activo:</span>
          <select
            id="tournament-selector-dropdown"
            aria-label="Seleccionar torneo activo"
            value={selectedTournament.id}
            onChange={(e) => setSelectedTournamentId(e.target.value)}
            className="w-full min-w-0 rounded-xl border border-[#232738] bg-[#141724] px-3 py-2 text-sm font-bold text-white focus:border-[#ff2e83] focus:outline-none sm:w-auto sm:max-w-xl sm:px-4 cursor-pointer"
          >
            {tournaments.map(t => (
              <option key={t.id} value={t.id}>{t.name} ({t.game})</option>
            ))}
          </select>
        </div>
      </div>

      {selectedTournament.status !== 'COMPLETED' && <section className="rounded-3xl border border-[#ff2e83]/25 bg-[linear-gradient(135deg,rgba(255,46,131,.08),rgba(16,18,26,.96)_45%)] p-5 lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[.2em] text-[#ff69a8]">Control de competición</div>
            <h2 className="mt-1 text-lg font-semibold text-white sm:text-xl">Operación de {selectedTournament.name}</h2>
            <p className="mt-1 text-xs text-slate-400">Participantes, llave, agenda y resultados confirmados en el registro activo.</p>
          </div>
          {hasSchedule && <button type="button" onClick={() => onNavigate('calendar')} className="rounded-xl bg-[#ff2e83] px-4 py-2.5 text-xs font-bold text-white">ABRIR PARTIDOS</button>}
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-4">
          {[
            ['Equipos inscritos', participants.length],
            ['Rondas de bracket', rounds.length],
            ['Partidos programados', flowMatches.length],
            ['Resultados oficiales', completedMatches],
          ].map(([label, value]) => <article key={label} className="rounded-2xl border border-white/10 bg-black/20 p-4"><strong className="block text-2xl font-black text-white">{value}</strong><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span></article>)}
        </div>
        {!hasParticipants && <button type="button" onClick={() => setActiveTab('MATCHES')} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#ff2e83]/30 px-4 py-2.5 text-xs font-bold text-[#ff69a8]"><UsersRound className="h-4 w-4"/> INSCRIBIR EQUIPOS</button>}
        {hasParticipants && !hasBracket && <button type="button" onClick={() => setActiveTab('MATCHES')} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#ff2e83] px-4 py-2.5 text-xs font-bold text-white"><Trophy className="h-4 w-4"/> GENERAR BRACKET</button>}
        {hasBracket && !hasSchedule && canManageTournament && <form onSubmit={handleCreateSchedule} className="mt-4 grid gap-2 rounded-2xl border border-white/10 bg-black/20 p-4 md:grid-cols-[1fr_1fr_150px_auto]">
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Inicio<input required type="datetime-local" value={scheduleStart} onChange={(event) => setScheduleStart(event.target.value)} className="field mt-1"/></label>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Sede<input value={scheduleVenue} onChange={(event) => setScheduleVenue(event.target.value)} className="field mt-1" placeholder="Online o arena"/></label>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Modalidad<select value={scheduleMode} onChange={(event) => setScheduleMode(event.target.value as typeof scheduleMode)} className="field mt-1"><option value="best_of_1">Mejor de 1</option><option value="best_of_3">Mejor de 3</option><option value="best_of_5">Mejor de 5</option></select></label>
          <button disabled={isScheduling} className="self-end rounded-xl bg-emerald-600 px-4 py-3 text-xs font-bold text-white disabled:opacity-50"><CalendarClock className="mr-1 inline h-4 w-4"/>{isScheduling ? 'PUBLICANDO…' : 'PROGRAMAR'}</button>
        </form>}
        {flowMessage && <p role="status" className={`mt-3 rounded-xl border px-4 py-3 text-xs ${flowMessage.includes('publicado') ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/25 bg-amber-500/10 text-amber-200'}`}>{flowMessage}</p>}
      </section>}

      {/* TOURNAMENT HEADER */}
      <div className="space-y-6 rounded-3xl border border-[#1e2230] bg-[#10121a] p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="px-3 py-1 rounded-md bg-[#181b28] border border-[#282d42] text-xs font-mono-code font-bold text-slate-300">
                {selectedTournament.game}
              </span>
              <span className="px-3 py-1 rounded-md bg-emerald-500/20 text-emerald-400 text-xs font-mono-code font-bold">
                PRIZE: {selectedTournament.prizePool}
              </span>
              <span className={`px-3 py-1 rounded-md text-xs font-bold ${
                selectedTournament.status === 'IN_PROGRESS'
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-blue-500/20 text-blue-400'
              }`}>
                ● {selectedTournament.status === 'IN_PROGRESS' ? 'IN PROGRESS' : selectedTournament.status}
              </span>
            </div>

            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              {selectedTournament.name}
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              {selectedTournament.description}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {canManageTournament && (nextStatuses[selectedTournament.status] || []).map((status) => <button key={status} disabled={isChangingStatus} onClick={() => void changeStatus(status)} className="rounded-xl border border-emerald-500/30 bg-emerald-500/[.08] px-4 py-2.5 text-xs font-bold text-emerald-300 disabled:opacity-50">{status === 'CLOSED' ? 'CERRAR INSCRIPCIÓN' : status === 'PUBLISHED' ? 'PUBLICAR' : status === 'IN_PROGRESS' ? 'INICIAR TORNEO' : status === 'COMPLETED' ? 'FINALIZAR' : 'ABRIR INSCRIPCIÓN'}</button>)}
            <button
              onClick={() => onNavigate('esports')}
              className="px-5 py-2.5 rounded-xl bg-[#ff2e83] hover:bg-[#e11d48] text-white font-black text-xs tracking-wider uppercase shadow-lg shadow-[#ff2e83]/30 transition-all flex items-center gap-2 cursor-pointer font-tech"
            >
              <Flame className="w-4 h-4" />
              <span>VER TRANSMISIONES</span>
            </button>
            <button
              onClick={() => onNavigate('rewards')}
              className="px-4 py-2.5 rounded-xl bg-[#181b28] hover:bg-[#222638] text-slate-300 hover:text-white border border-[#282d42] text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer font-tech"
            >
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <span>Bolsa de premios</span>
            </button>
          </div>
        </div>

        {/* TABS */}
        <div className="tx-nav-scroll flex min-w-0 snap-x snap-mandatory items-center gap-1 overflow-x-auto border-b border-[#1e2230] pt-4 scroll-smooth sm:gap-2">
          {(['OVERVIEW', 'BRACKET', 'MATCHES', 'STANDINGS'] as const).map((tab) => (
            <button
              key={tab}
              id={`tab-tournament-${tab.toLowerCase()}`}
              onClick={() => setActiveTab(tab)}
              aria-label={tab === 'OVERVIEW' ? 'Información del torneo' : tab === 'BRACKET' ? 'Cuadro y bracket' : tab === 'MATCHES' ? 'Partidos' : 'Clasificación'}
              className={`shrink-0 snap-start whitespace-nowrap border-b-2 px-3 py-3 text-[11px] font-black uppercase tracking-wide transition-all sm:px-5 sm:text-xs sm:tracking-wider cursor-pointer font-tech ${
                activeTab === tab
                  ? 'border-[#ff2e83] text-[#ff2e83] bg-[#ff2e83]/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="sm:hidden">{tab === 'OVERVIEW' ? 'INFO' : tab === 'BRACKET' ? 'BRACKET' : tab === 'MATCHES' ? 'PARTIDOS' : 'TABLA'}</span>
              <span className="hidden sm:inline">{tab === 'OVERVIEW' ? 'INFORMACIÓN' : tab === 'BRACKET' ? 'CUADRO / BRACKET' : tab === 'MATCHES' ? 'PARTIDOS' : 'CLASIFICACIÓN'}</span>
            </button>
          ))}
        </div>
      </div>

      {/* TAB CONTENT: BRACKET VIEW */}
      {activeTab === 'BRACKET' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-[#10121a] border border-[#1e2230]">
            <div className="flex items-center gap-2 text-xs text-slate-300 font-medium">
              <Sparkles className="w-4 h-4 text-[#ff2e83]" />
              <span className="font-tech">Árbol de Llaves Interactivo • Formato Eliminación Directa</span>
            </div>

            <div className="flex items-center gap-3">
              {canEditScores && rounds.length > 0 && (
                <span className="text-[11px] font-mono-code text-amber-400 bg-amber-500/10 px-2 py-1 rounded">
                  Modo {currentUserRole}: Clic en partida para editar marcador
                </span>
              )}
            </div>
          </div>

          {rounds.length > 0 && <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_1.5fr]">
            <article className="rounded-2xl border border-white/10 bg-[#10121a] p-4"><strong className="text-2xl font-black text-white">{rounds.length}</strong><span className="mt-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Rondas</span></article>
            <article className="rounded-2xl border border-white/10 bg-[#10121a] p-4"><strong className="text-2xl font-black text-white">{bracketMatches.length}</strong><span className="mt-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Cruces</span></article>
            <article className="rounded-2xl border border-white/10 bg-[#10121a] p-4"><strong className="text-2xl font-black text-emerald-400">{completedBracketMatches}</strong><span className="mt-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Finalizados</span></article>
            <article className="rounded-2xl border border-white/10 bg-[#10121a] p-4"><div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Avance de la llave</span><strong className="text-sm text-[#ff69a8]">{bracketProgress}%</strong></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-gradient-to-r from-[#ff2e83] to-[#d6b15e]" style={{ width: `${bracketProgress}%` }}/></div></article>
          </div>}

          {/* BRACKET CANVAS */}
          <div className="min-h-[420px] overflow-x-auto rounded-3xl border border-[#1e2230] bg-[#0e1017] p-4 sm:min-h-[500px] sm:p-6 lg:p-8">
            {rounds.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-24 text-center gap-3">
                <p className="text-sm text-slate-400">Este torneo todavía no tiene un bracket generado.</p>
                <button
                  onClick={() => setActiveTab('MATCHES')}
                  className="text-xs font-bold text-[#ff2e83] hover:underline cursor-pointer"
                >
                  Ir a la pestaña PARTIDOS para inscribir participantes y generarlo
                </button>
              </div>
            ) : (
              <div className="flex items-stretch gap-12 sm:gap-16 min-w-[760px] justify-between py-4">
                {rounds.map((round, roundIndex) => {
                  const isFinal = roundIndex === rounds.length - 1;
                  const bestOf = round.matches[0]?.bestOf;

                  return (
                    <div key={round.id} className={`flex-1 flex flex-col ${isFinal ? 'justify-center space-y-6' : 'justify-around space-y-8'}`}>
                      <div className="text-center mb-2">
                        {isFinal ? (
                          <span className="mx-auto flex w-fit items-center justify-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-sm font-semibold text-amber-400">
                            <Trophy className="w-4 h-4" />
                            {round.name}
                          </span>
                        ) : (
                          <span className="rounded-full border border-[#232738] bg-[#161926] px-3 py-1 text-sm font-semibold text-slate-400">
                            {round.name}{bestOf ? ` (BO${bestOf})` : ''}
                          </span>
                        )}
                      </div>

                      {round.matches.map((m) => isFinal ? (
                        <div
                          key={m.id}
                          onClick={() => handleOpenMatch(m, 'knockout')}
                          className="p-4 rounded-2xl bg-gradient-to-br from-[#1c1a2e] to-[#141624] border-2 border-amber-500/40 hover:border-amber-400 transition-all shadow-xl cursor-pointer"
                        >
                          <div className="text-[10px] font-mono-code text-slate-400 text-center pb-2 uppercase tracking-widest">
                            {m.status === 'FINISHED' ? 'FINALIZADO' : (m.scheduledTime || 'POR DISPUTAR')}
                          </div>

                          <div className="flex items-center justify-between py-2 px-3 rounded bg-black/40 text-white font-bold">
                            <span className="text-sm">{m.team1.name}</span>
                            <span className="font-mono-code text-sm text-amber-400">{m.team1.score}</span>
                          </div>

                          <div className="flex items-center justify-between py-2 px-3 rounded bg-black/40 text-white font-bold mt-2">
                            <span className="text-sm">{m.team2.name}</span>
                            <span className="font-mono-code text-sm text-amber-400">{m.team2.score}</span>
                          </div>
                        </div>
                      ) : (
                        <div key={m.id} onClick={() => handleOpenMatch(m, 'knockout')} className="relative group cursor-pointer">
                          <div className="p-3 rounded-xl bg-[#141724] border border-[#202538] hover:border-[#ff2e83] transition-all shadow-md">
                            {m.status === 'LIVE' && (
                              <div className="pb-1 text-[10px] font-mono-code text-red-400 font-bold flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping"></span>
                                EN JUEGO
                              </div>
                            )}

                            <div className={`flex items-center justify-between py-1.5 px-2 rounded ${
                              m.team1.winner ? 'bg-emerald-500/10 font-bold text-white' : 'text-slate-300'
                            }`}>
                              <div className="flex items-center gap-2">
                                {roundIndex === 0 && m.team1.seed !== undefined && (
                                  <span className="text-[10px] font-mono-code text-slate-500">#{m.team1.seed}</span>
                                )}
                                <span className="text-xs truncate max-w-[120px]">{m.team1.name}</span>
                              </div>
                              <span className={`font-mono-code text-xs font-bold ${
                                m.team1.winner ? 'text-emerald-400' : 'text-slate-400'
                              }`}>
                                {m.team1.score}
                              </span>
                            </div>

                            <div className={`flex items-center justify-between py-1.5 px-2 rounded mt-1 ${
                              m.team2.winner ? 'bg-emerald-500/10 font-bold text-white' : 'text-slate-300'
                            }`}>
                              <div className="flex items-center gap-2">
                                {roundIndex === 0 && m.team2.seed !== undefined && (
                                  <span className="text-[10px] font-mono-code text-slate-500">#{m.team2.seed}</span>
                                )}
                                <span className="text-xs truncate max-w-[120px]">{m.team2.name}</span>
                              </div>
                              <span className={`font-mono-code text-xs font-bold ${
                                m.team2.winner ? 'text-emerald-400' : 'text-slate-400'
                              }`}>
                                {m.team2.score}
                              </span>
                            </div>
                          </div>

                          <div className="hidden sm:block absolute -right-6 top-1/2 w-6 h-0.5 bg-[#2a3047] group-hover:bg-[#ff2e83]/60 transition-colors"></div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: OVERVIEW */}
      {activeTab === 'OVERVIEW' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-[#10121a] border border-[#1e2230] space-y-4">
            <h3 className="text-lg font-semibold text-white">Detalles del Formato</h3>
            <ul className="text-xs space-y-2.5 text-slate-300">
              <li className="flex justify-between">
                <span className="text-slate-400">Tipo de Torneo:</span>
                <span className="font-bold">{selectedTournament.format}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-slate-400">Equipos Inscritos:</span>
                <span className="font-bold">{selectedTournament.registeredTeams} / {selectedTournament.maxTeams}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-slate-400">Modalidad:</span>
                <span className="font-bold">Presencial & Online</span>
              </li>
              <li className="flex justify-between">
                <span className="text-slate-400">Sede Principal:</span>
                <span className="font-bold text-[#ff2e83]">{selectedTournament.venue || 'Online Arena'}</span>
              </li>
            </ul>
          </div>

          <div className="p-6 rounded-2xl bg-[#10121a] border border-[#1e2230] space-y-4">
            <h3 className="text-lg font-semibold text-white">Bolsa de premios</h3>
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-2 rounded bg-[#141724]">
                <span className="font-bold text-white">Monto total</span>
                <span className="font-mono-code font-bold text-emerald-400">{selectedTournament.prizePool}</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              El desglose y la entrega de premios se administran desde la sección "Bolsa de premios".
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#10121a] border border-[#1e2230] space-y-4">
            <h3 className="text-lg font-semibold text-white">Reglamento Oficial</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Todos los equipos deben conectarse al servidor 15 minutos antes de la hora estipulada. El anti-cheat Vanguard debe estar activo. Se permite 1 pausa táctica de 60s por mapa.
            </p>
          </div>

          {canManageTournament && <div className="p-6 rounded-2xl bg-[#10121a] border border-[#1e2230] space-y-4 md:col-span-3"><div className="flex items-center justify-between"><div><h3 className="text-lg font-semibold text-white">Bitácora del torneo</h3><p className="mt-1 text-xs text-slate-500">Cada transición queda asociada a la cuenta que la autorizó.</p></div><span className="status-chip text-slate-300">{audit.length} cambios</span></div>{audit.length === 0 ? <p className="text-sm text-slate-500">Todavía no hay cambios de estado registrados.</p> : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{[...audit].reverse().slice(0, 6).map((entry) => <article key={entry.id} className="rounded-xl border border-white/[.07] bg-black/20 p-3"><strong className="text-xs text-white">{entry.previousStatus} → {entry.nextStatus}</strong><p className="mt-1 text-[11px] text-slate-500">{new Date(entry.createdAt).toLocaleString('es-MX')}</p>{entry.note && <p className="mt-2 text-xs text-slate-400">{entry.note}</p>}</article>)}</div>}</div>}
        </div>
      )}

      {/* TAB CONTENT: MATCHES (inscripción, fase de grupos y generación de bracket) */}
      {activeTab === 'MATCHES' && (
        <div className="space-y-6">
          <div className="p-6 rounded-3xl bg-[#10121a] border border-[#1e2230] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-white">Participantes</h3>
              <span className="text-xs font-mono-code text-slate-400">
                {selectedTournament.registeredTeams} / {selectedTournament.maxTeams || '∞'}
              </span>
            </div>

            {participantsLoading ? (
              <p className="text-sm text-slate-400">Cargando participantes…</p>
            ) : participants.length === 0 ? (
              <p className="text-sm text-slate-400">Todavía no hay participantes inscritos.</p>
            ) : (
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {participants.map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#141724] text-xs text-slate-200">
                    <span className="font-bold">{p.name}</span>
                    <span className="font-mono-code text-slate-500">#{p.seed}</span>
                  </li>
                ))}
              </ul>
            )}

            {canManageTournament && rounds.length === 0 && (
              <form onSubmit={handleAddParticipant} className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-[#1e2230]">
                <select
                  required
                  value={newParticipantTeamId}
                  onChange={(e) => setNewParticipantTeamId(e.target.value)}
                  className="flex-1 bg-[#141724] border border-[#232738] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-[#ff2e83] focus:outline-none"
                >
                  <option value="">Selecciona un equipo activo</option>
                  {availableTeams.map((team) => <option key={team.id} value={team.id}>{team.name} · {team.region}</option>)}
                </select>
                <input
                  type="number"
                  value={newParticipantSeed}
                  onChange={(e) => setNewParticipantSeed(e.target.value)}
                  placeholder="Seed"
                  className="w-full sm:w-24 bg-[#141724] border border-[#232738] rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-[#ff2e83] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isRegistering || !newParticipantTeamId}
                  className="px-4 py-2 rounded-xl bg-[#ff2e83] hover:bg-[#e11d48] text-white font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRegistering ? 'Agregando…' : 'Agregar'}
                </button>
              </form>
            )}
            {registerError && <p className="text-xs font-semibold text-red-400">{registerError}</p>}
          </div>

          {selectedTournament.format === 'GROUP_STAGE_PLAYOFFS' && (
            <div className="p-6 rounded-3xl bg-[#10121a] border border-[#1e2230] space-y-4">
              <h3 className="text-xl font-semibold text-white">Fase de Grupos</h3>

              {groupsLoading ? (
                <p className="text-sm text-slate-400">Cargando grupos…</p>
              ) : groups.length === 0 ? (
                <>
                  <p className="text-sm text-slate-400">Todavía no se generaron los grupos.</p>
                  {canManageTournament && (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={groupCountInput}
                        onChange={(e) => setGroupCountInput(e.target.value)}
                        className="w-20 bg-[#141724] border border-[#232738] rounded-xl px-3 py-2 text-xs text-white focus:border-[#ff2e83] focus:outline-none"
                      />
                      <button
                        onClick={handleGenerateGroupsClick}
                        disabled={isGeneratingGroups || participants.length < 2}
                        className="px-4 py-2 rounded-xl bg-[#ff2e83] hover:bg-[#e11d48] text-white font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isGeneratingGroups ? 'Generando…' : 'Generar Grupos'}
                      </button>
                    </div>
                  )}
                  {generateGroupsError && <p className="text-xs font-semibold text-red-400">{generateGroupsError}</p>}
                </>
              ) : (
                <div className="space-y-4">
                  {groups.map((group) => (
                    <div key={group.id} className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-300 uppercase">{group.name}</h4>
                      <div className="space-y-1">
                        {group.matches.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => canEditScores && handleOpenMatch(m, 'group')}
                            disabled={!canEditScores}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#141724] hover:bg-[#1a1e2e] text-xs text-left transition-colors disabled:cursor-default disabled:hover:bg-[#141724]"
                          >
                            <span className="text-slate-200">{m.team1.name} <span className="text-slate-500">vs</span> {m.team2.name}</span>
                            <span className="font-mono-code font-bold text-white">
                              {m.status === 'FINISHED' ? `${m.team1.score} - ${m.team2.score}` : 'Pendiente'}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

                  {rounds.length === 0 && (
                    <div className="pt-2 border-t border-[#1e2230] space-y-2">
                      {!allGroupMatchesFinished ? (
                        <p className="text-xs text-slate-500">Cuando terminen todos los partidos de grupo vas a poder generar el bracket de playoffs.</p>
                      ) : canManageTournament ? (
                        <button
                          onClick={handleGenerateBracketClick}
                          disabled={isGeneratingBracket}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isGeneratingBracket ? 'Generando…' : 'Generar Bracket desde Grupos'}
                        </button>
                      ) : null}
                      {generateBracketError && <p className="text-xs font-semibold text-red-400">{generateBracketError}</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {selectedTournament.format !== 'GROUP_STAGE_PLAYOFFS' && rounds.length === 0 && (
            <div className="p-6 rounded-3xl bg-[#10121a] border border-[#1e2230] space-y-3">
              <h3 className="text-xl font-semibold text-white">Generar Bracket</h3>
              <p className="text-sm text-slate-400">
                Con {participants.length} participante{participants.length === 1 ? '' : 's'} inscritos ya se puede armar la llave de eliminación directa.
              </p>
              {canManageTournament && (
                <button
                  onClick={handleGenerateBracketClick}
                  disabled={isGeneratingBracket || participants.length < 2}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGeneratingBracket ? 'Generando…' : 'Generar Bracket'}
                </button>
              )}
              {generateBracketError && <p className="text-xs font-semibold text-red-400">{generateBracketError}</p>}
            </div>
          )}

          {rounds.length > 0 && (
            <div className="p-6 rounded-3xl bg-[#10121a] border border-[#1e2230] text-center text-sm text-slate-400">
              El bracket ya fue generado — anda a la pestaña "CUADRO / BRACKET" para cargar resultados y avanzar rondas.
            </div>
          )}
        </div>
      )}

      {/* TAB CONTENT: STANDINGS */}
      {activeTab === 'STANDINGS' && (
        <div className="space-y-6">
          {selectedTournament.format !== 'GROUP_STAGE_PLAYOFFS' ? (
            <div className="p-6 rounded-3xl bg-[#10121a] border border-[#1e2230] text-center text-sm text-slate-400">
              Este torneo usa eliminación directa: no tiene tabla de posiciones de fase de grupos.
            </div>
          ) : groupsLoading ? (
            <div className="p-6 rounded-3xl bg-[#10121a] border border-[#1e2230] text-center text-sm text-slate-400">
              Cargando clasificación…
            </div>
          ) : groups.length === 0 ? (
            <div className="p-6 rounded-3xl bg-[#10121a] border border-[#1e2230] text-center text-sm text-slate-400">
              Todavía no se generaron los grupos de este torneo.
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.id} className="p-6 rounded-3xl bg-[#10121a] border border-[#1e2230] space-y-4">
                <h3 className="text-xl font-semibold text-white">{group.name}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#1e2230] text-slate-400 font-mono-code">
                        <th className="py-3 px-4">POS</th>
                        <th className="py-3 px-4">EQUIPO</th>
                        <th className="py-3 px-4">PJ</th>
                        <th className="py-3 px-4">V</th>
                        <th className="py-3 px-4">E</th>
                        <th className="py-3 px-4">D</th>
                        <th className="py-3 px-4">PTS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e2230]">
                      {group.standings.map((row, index) => (
                        <tr key={row.participantId} className="text-white hover:bg-[#141724]">
                          <td className={`py-3 px-4 font-bold ${index === 0 ? 'text-amber-400' : index === 1 ? 'text-slate-300' : 'text-slate-500'}`}>{index + 1}</td>
                          <td className="py-3 px-4 font-bold">{row.name}</td>
                          <td className="py-3 px-4 font-mono-code">{row.played}</td>
                          <td className="py-3 px-4 font-mono-code text-emerald-400">{row.won}</td>
                          <td className="py-3 px-4 font-mono-code text-slate-400">{row.drawn}</td>
                          <td className="py-3 px-4 font-mono-code text-slate-400">{row.lost}</td>
                          <td className="py-3 px-4 font-mono-code font-bold">{row.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* MODAL: MATCH DETAILS & SCORE EDIT */}
      {selectedMatch && (
        <div
          id="modal-match-details"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-[#12141e] border border-[#282e44] rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#1e2230] pb-4">
              <div>
                <span className="text-xs font-medium text-[#ff69a8]">
                  {selectedTournament.name}
                </span>
                <h3 className="text-xl font-semibold text-white sm:text-2xl">
                  Detalles del Enfrentamiento
                </h3>
              </div>
              <button
                onClick={() => { setSelectedMatch(null); setSelectedMatchKind(null); }}
                className="text-slate-400 hover:text-white font-mono-code text-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-[#0c0d13] border border-[#1e2230] space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white">{selectedMatch.team1.name}</span>
                {canEditScores ? (
                  <input
                    type="number"
                    value={tempScore1}
                    onChange={(e) => setTempScore1(parseInt(e.target.value) || 0)}
                    className="w-16 bg-[#1b1f2e] text-center font-mono-code font-bold text-lg text-white border border-[#2e354d] rounded-lg p-1"
                  />
                ) : (
                  <span className="font-mono-code font-bold text-lg text-white">{selectedMatch.team1.score}</span>
                )}
              </div>

              <div className="text-center font-mono-code text-xs text-slate-500">VS</div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-white">{selectedMatch.team2.name}</span>
                {canEditScores ? (
                  <input
                    type="number"
                    value={tempScore2}
                    onChange={(e) => setTempScore2(parseInt(e.target.value) || 0)}
                    className="w-16 bg-[#1b1f2e] text-center font-mono-code font-bold text-lg text-white border border-[#2e354d] rounded-lg p-1"
                  />
                ) : (
                  <span className="font-mono-code font-bold text-lg text-white">{selectedMatch.team2.score}</span>
                )}
              </div>
            </div>

            {selectedMatchKind === 'knockout' && (
              <p className="text-[11px] text-slate-500">Los partidos de eliminación directa no permiten empates.</p>
            )}

            {scoreError && (
              <p className="text-xs font-semibold text-red-400">{scoreError}</p>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => { setSelectedMatch(null); setSelectedMatchKind(null); }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cerrar
              </button>
              {canEditScores && (
                <button
                  onClick={handleSaveScore}
                  disabled={isSavingScore}
                  className="px-6 py-2.5 rounded-xl bg-[#ff2e83] hover:bg-[#e11d48] text-white font-bold text-xs shadow-lg shadow-[#ff2e83]/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingScore ? 'Guardando…' : selectedMatchKind === 'knockout' ? 'Guardar y Avanzar Llave' : 'Guardar Resultado'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
