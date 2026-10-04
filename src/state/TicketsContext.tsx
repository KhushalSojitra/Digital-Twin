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

interface TicketsValue {
  tickets: Ticket[]
  addTicket: (input: NewTicketInput) => Ticket
  assign: (id: string, assignee: string, by: string) => void
  toggleFollow: (id: string, person: string) => void
  addFollowers: (id: string, people: string[], by: string) => void
  shareWith: (id: string, person: string, by: string) => void
  removeFollower: (id: string, person: string, by: string) => void
  addComment: (id: string, text: string, by: string) => void
  updateDetails: (id: string, patch: { title: string; description: string; priority: Ticket['priority'] }, by: string) => void
  transition: (id: string, state: LifecycleState, input: TransitionInput) => void
  attachSnapshot: (id: string, slot: 'before' | 'after', snapshot: Snapshot) => void
}

const TicketsContext = createContext<TicketsValue | null>(null)

export function TicketsProvider({ children }: { children: ReactNode }) {
  const [tickets, setTickets] = useState<Ticket[]>([])

  // 1. READ PIPELINE - REBUILDS EXPLICIT MANDATORY SCHEMAS FOR INNER UI CONSUMERS
  useEffect(() => {
    async function loadInitialTickets() {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (!error && data) {
        const mappedTickets: Ticket[] = data.map((row: any) => {
          const ptz = row.ptz_coordinates || {};
          const targetCameraId = row.camera_name || 'ellis-360';
          const distanceM = Number(ptz.distanceM) || 35;
          const yaw = Number(ptz.yaw) || 0;

          // Compute exact geospatial pinning metrics for map engine overlays
          const earthCoords = locateOnEarth('site-01', yaw, distanceM);

          return {
            id: row.ticket_id || row.id,
            title: row.title,
            description: row.description || '',
            status: row.status === 'to do' ? 'open' : (row.status || 'open'),
            priority: (row.priority === 'meduim' || row.priority === 'medium') ? 'medium' : row.priority,
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

  const patch = useCallback((id: string, fn: (t: Ticket) => Ticket) => {
    setTickets((prev) => prev.map((t) => (t.id === id ? fn(t) : t)))
  }, [])

  const log = (t: Ticket, by: string, text: string, state?: LifecycleState): Ticket => {
    const at = new Date().toISOString()
    return { ...t, updatedAt: at, timeline: [...(t.timeline ?? []), { at, by, text, state }] }
  }

  // 2. CREATE TICKET ACTION - FORCES UNIQUE TIME ID FORMATS TO PREVENT OVERWRITES
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
        if (error) console.error("Supabase sync error:", error.message);
      });

    setTickets((prev) => [ticket, ...prev])
    return ticket
  }, [])
  // 3. REALTIME SYNC ROUTER EXTENSION CHANNEL
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

              const freshTicket: Ticket = {
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

  // UI STATE MUTATION PIPELINES WITH ACTIVE PARAMETER REFACTORING FOR COMPILER SANITY
  const assign = useCallback((id: string, assignee: string, by: string) => patch(id, (t) => log({ ...t, assignee }, by, `Assigned to ${assignee}`)), [patch]);
  const toggleFollow = useCallback((id: string, person: string) => patch(id, (t) => log({ ...t }, person, 'Toggled follower status')), [patch]);
  
  const addFollowers = useCallback((id: string, people: string[], by: string) => patch(id, (t) => {
    return log({ ...t, followers: [...(t.followers || []), ...people] }, by, 'Added followers');
  }), [patch]);

  const shareWith = useCallback((id: string, person: string, by: string) => patch(id, (t) => {
    return log({ ...t, followers: [...(t.followers || []), person] }, by, 'Shared ticket');
  }), [patch]);

  const removeFollower = useCallback((id: string, person: string, by: string) => patch(id, (t) => {
    return log({ ...t, followers: (t.followers || []).filter((f: string) => f !== person) }, by, 'Removed follower');
  }), [patch]);

  const updateDetails = useCallback((id: string, next: any, by: string) => patch(id, (t) => log({ ...t, ...next }, by, 'Updated details')), [patch]);
  const addComment = useCallback((id: string, text: string, by: string) => patch(id, (t) => ({ ...t, comments: [...(t.comments || []), { at: new Date().toISOString(), by, text }] })), [patch]);
  const transition = useCallback((id: string, state: LifecycleState, input: TransitionInput) => patch(id, (t) => log({ ...t, status: STATE_RESULT[state] }, input.by, `Moved to ${state}`)), [patch]);

  const attachSnapshot = useCallback((id: string, slot: 'before' | 'after', snapshot: Snapshot) => patch(id, (t) => {
    const freshSnaps = { ...t.snapshots, [slot]: snapshot };
    return { ...t, snapshots: freshSnaps };
  }), [patch]);

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
