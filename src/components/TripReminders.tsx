import { useEffect } from 'react';
import { useHistory } from 'react-router-dom';
import { useTrip } from '../context/TripContext';
import { onReminderTap, syncReminders } from '../native/reminders';

// 일정이 바뀌면 여행 알림(전날 저녁, 여행 중 아침)을 다시 예약하고, 알림을 누르면 오늘 일정 화면을 연다
const TripReminders: React.FC = () => {
  const history = useHistory();
  const { trips } = useTrip();
  // 알림 내용에 들어가는 것만 본다 (메모·금액을 고칠 때마다 다시 예약하지 않게)
  const sig = JSON.stringify(trips.map((t) => [t.id, t.title, t.destination, t.startDate, t.endDate, t.days.map((d) => d.map((p) => p.name))]));

  useEffect(() => {
    const h = setTimeout(() => syncReminders(trips), 1500);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  useEffect(() => onReminderTap((tripId) => history.push('/today?trip=' + encodeURIComponent(tripId))), [history]);

  return null;
};

export default TripReminders;
