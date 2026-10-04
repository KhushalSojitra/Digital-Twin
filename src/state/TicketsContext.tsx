import { createContext, useCallback, useContext, useMemo, useState, useEffect, type ReactNode } from 'react'
import { supabase } from '../supabaseClient'
import {
  STATE_RESULT,
  createTicket,
  locateOnEarth,
  type LifecycleState,
  type NewTicketInput,
  type Snapshot,
  type Ticket,
} from '../data/tickets'

export interface TransitionInput {
  by: string
  notes?: string
  snapshot?: Snapshot
}

const TicketsContext = createContext<any>(null)

export function TicketsProvider({ children }: { children: ReactNode }) {
  const [tickets, setTickets] = useState<any[]>([])

  const patch = useCallback((id: string, fn: (t: any) => any) => {
    setTickets((prev) => prev.map((t) => (t.id === id ? fn(t) : t)))
  }, [])

  const log = (t: any, by: string, text: string, state?: LifecycleState): any => {
    const at = new Date().toISOString()
    return { ...t, updatedAt: at, timeline: [...(t.timeline ?? []), { at, by, text, state }] }
  }
  // 1. FETCH TICKETS AND INJECT MAP COORDINATE GENERATORS
  useEffect(() => {
    async function loadInitialTickets() {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (!error && data) {
        const mappedTickets = data.map((row: any) => {
          const ptz = row.ptz_coordinates || {};
          const targetCameraId = row.camera_name || 'ellis-360';
          const distanceM = Number(ptz.distanceM) || 35;
          const yaw = Number(ptz.yaw) || 0;

          // Re-project geo-spatial maps so points show up dynamically on screen
          const earthCoords = locateOnEarth('site-01', yaw, distanceM);

          return {
            id: row.ticket_id || row.id,
            title: row.title,
            description: row.description || '',
            status: row.status === 'to do' ? 'open' : (row.status || 'open'),
            priority: (row.priority === 'meduim' || row.priority === 'medium') ? 'medium' : (row.priority || 'medium'),
            type: 'intrusion', 
            cameraId: targetCameraId,
            siteId: 'site-01',
            zone: 'Perimeter',
            assignee: row.assignee || '',
            creator: row.reporter || 'System',
            platform: 'default',
            followers: [],
            comments: Array.isArray(row.replies) ? row.replies : [],
            createdAt: row.created_at,
            updatedAt: row.created_at,
            snapshots: {},
            snapshotConfig: { captureCreation: true, captureCompletion: true, showInImprovementHistory: true },
            timeline: Array.isArray(row.history_log) ? row.history_log : [],
            yaw: yaw,
            pitch: Number(ptz.pitch) || 0,
            zoom: Number(ptz.zoom) || 1,
            distanceM: distanceM,
            lat: earthCoords.lat || Number(ptz.lat) || 0,
            lng: earthCoords.lng || Number(ptz.lng) || 0
          };
        });
        setTickets(mappedTickets);
      }
    }
    loadInitialTickets();
  }, []);

  // 2. CREATE TICKET ACTION
  const addTicket = useCallback((input: NewTicketInput) => {
    const ticket = createTicket(input)
    const uniqueId = `OE-${Date.now().toString().slice(-4)}`
    ticket.id = uniqueId

    supabase
      .from('tickets')
      .insert([
        {
          id: uniqueId,
          ticket_id: uniqueId, 
          title: ticket.title,
          description: ticket.description,
          priority: ticket.priority,
          status: 'to do', 
          reporter: ticket.creator,
          assignee: ticket.assignee || 'Unassigned',
          camera_name: ticket.cameraId,
          ptz_coordinates: {
            yaw: ticket.yaw,
            pitch: ticket.pitch,
            zoom: ticket.zoom,
            distanceM: ticket.distanceM,
            lat: ticket.lat,
            lng: ticket.lng
          },
          history_log: ticket.timeline,
          replies: ticket.comments
        }
      ])
      .then(({ error }) => {
        if (error) console.error("Supabase error:", error.message);
      });

    setTickets((prev) => [ticket, ...prev])
    return ticket
  }, [])
  // 3. BROADCAST ROUTER INTERCEPTOR
  useEffect(() => {
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets' },
        (payload) => {
          const { eventType, new: newRow } = payload as any;
          const ptz = newRow?.ptz_coordinates || {};

          if (eventType === 'INSERT') {
            setTickets((prev) => {
              const trackingId = newRow.ticket_id || newRow.id;
              if (prev.some((t) => t.id === trackingId)) return prev;
              
              const yawVal = Number(ptz.yaw) || 0;
              const distVal = Number(ptz.distanceM) || 35;
              const liveCoords = locateOnEarth('site-01', yawVal, distVal);

              const freshTicket = {
                id: trackingId,
                title: newRow.title,
                description: newRow.description || '',
                status: newRow.status === 'to do' ? 'open' : (newRow.status || 'open'),
                priority: (newRow.priority === 'meduim' || newRow.priority === 'medium') ? 'medium' : (newRow.priority || 'medium'),
                type: 'intrusion',
                cameraId: newRow.camera_name || 'ellis-360',
                siteId: 'site-01',
                zone: 'Perimeter',
                assignee: newRow.assignee || '',
                creator: newRow.reporter || 'System',
                platform: 'default',
                followers: [],
                comments: Array.isArray(newRow.replies) ? newRow.replies : [],
                createdAt: newRow.created_at,
                updatedAt: newRow.created_at,
                snapshots: {},
                snapshotConfig: { captureCreation: true, captureCompletion: true, showInImprovementHistory: true },
                timeline: Array.isArray(newRow.history_log) ? newRow.history_log : [],
                yaw: yawVal,
                pitch: Number(ptz.pitch) || 0,
                zoom: Number(ptz.zoom) || 1,
                distanceM: distVal,
                lat: liveCoords.lat || Number(ptz.lat) || 0,
                lng: liveCoords.lng || Number(ptz.lng) || 0
              };
              return [freshTicket, ...prev];
            });
          } 
          
          else if (eventType === 'UPDATE') {
            setTickets((prev) =>
              prev.map((t) => {
                const trackingId = newRow.ticket_id || newRow.id;
                return t.id === trackingId
                  ? {
                      ...t,
                      title: newRow.title,
                      description: newRow.description || '',
                      priority: (newRow.priority === 'meduim' || newRow.priority === 'medium') ? 'medium' : (newRow.priority || 'medium'),
                      status: newRow.status === 'to do' ? 'open' : (newRow.status || 'open'),
                      assignee: newRow.assignee || '',
                      timeline: Array.isArray(newRow.history_log) ? newRow.history_log : t.timeline,
                      comments: Array.isArray(newRow.replies) ? newRow.replies : t.comments,
                      yaw: Number(ptz.yaw) || t.yaw,
                      pitch: Number(ptz.pitch) || t.pitch,
                      zoom: Number(ptz.zoom) || t.zoom,
                      lat: Number(ptz.lat) || t.lat,
                      lng: Number(ptz.lng) || t.lng
                    }
                  : t;
              })
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const assign = useCallback((id: string, assignee: string, by: string) => patch(id, (t) => log({ ...t, assignee }, by, `Assigned to ${assignee}`)), [patch]);
  const toggleFollow = useCallback((id: string, person: string) => patch(id, (t) => log({ ...t }, person, 'Toggled follower status')), [patch]);
  const addFollowers = useCallback((id: string, p: string[], b: string) => patch(id, (t) => log({ ...t }, b, 'Added followers')), [patch]);
  const shareWith = useCallback((id: string, p: string, b: string) => patch(id, (t) => log({ ...t }, b, 'Shared ticket')), [patch]);
  const removeFollower = useCallback((id: string, p: string, b: string) => patch(id, (t) => log({ ...t }, b, 'Removed follower')), [patch]);
  const updateDetails = useCallback((id: string, n: any, b: string) => patch(id, (t) => log({ ...t, ...n }, b, 'Updated details')), [patch]);
  const addComment = useCallback((id: string, text: string, by: string) => patch(id, (t) => ({ ...t, comments: [...(t.comments || []), { at: new Date().toISOString(), by, text }] })), [patch]);
  const transition = useCallback((id: string, state: LifecycleState, input: TransitionInput) => patch(id, (t) => log({ ...t, status: STATE_RESULT[state] }, input.by, `Moved to ${state}`)), [patch]);
  const attachSnapshot = useCallback((id: string, slot: 'before' | 'after', snapshot: Snapshot) => patch(id, (t) => ({ ...t })), [patch]);

  const value = useMemo(
    () => ({ tickets, addTicket, assign, toggleFollow, addFollowers, shareWith, removeFollower, addComment, updateDetails, transition, attachSnapshot }),
    [tickets, addTicket, assign, toggleFollow, addFollowers, shareWith, removeFollower, addComment, updateDetails, transition, attachSnapshot],
  )

  return <TicketsContext.Provider value={value}>{children}</TicketsContext.Provider>
}

export function useTickets() {
  const ctx = useContext(TicketsContext)
  if (!ctx) throw new Error('useTickets must be used within TicketsProvider')
  return ctx
}
