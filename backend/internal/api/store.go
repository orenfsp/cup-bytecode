package api

import (
	"database/sql"
	"mime/multipart"
	"net/http"
	"time"

	"otklik/internal/tracknum"
)

type ticket struct {
	ID                  int64
	ApplicantType       string
	CategoryID          *int64
	SuggestedCategoryID *int64
	FreeText            string
	ClarifyingAnswers   string
	Status              string
	Priority            string
	IsCrisis            bool
	OperatorID          *int64
	AssignedExpertID    *int64
	ContactInfo         *string
	RejectReason        *string
	ReturnCount         int
	Rating              *int
	RatingComment       *string
	CreatedAt           time.Time
	UpdatedAt           time.Time
	AcceptedAt          *time.Time
	FirstResponseAt     *time.Time
	ClosedAt            *time.Time
}

const ticketCols = `id, applicant_type, category_id, suggested_category_id, free_text, clarifying_answers,
	status, priority, is_crisis, operator_id, assigned_expert_id, contact_info, reject_reason, return_count,
	rating, rating_comment, created_at, updated_at, accepted_at, first_response_at, closed_at`

func scanTicket(row interface{ Scan(...interface{}) error }) (ticket, error) {
	var t ticket
	err := row.Scan(&t.ID, &t.ApplicantType, &t.CategoryID, &t.SuggestedCategoryID, &t.FreeText, &t.ClarifyingAnswers,
		&t.Status, &t.Priority, &t.IsCrisis, &t.OperatorID, &t.AssignedExpertID, &t.ContactInfo, &t.RejectReason, &t.ReturnCount,
		&t.Rating, &t.RatingComment, &t.CreatedAt, &t.UpdatedAt, &t.AcceptedAt, &t.FirstResponseAt, &t.ClosedAt)
	return t, err
}

func (s *Server) ticketByID(id int64) (ticket, bool) {
	row := s.DB.QueryRow(`SELECT `+ticketCols+` FROM tickets WHERE id=$1`, id)
	t, err := scanTicket(row)
	return t, err == nil
}

func (s *Server) ticketByTrack(track string) (ticket, bool) {
	hash := tracknum.Hash(s.Cfg.TrackPepper, track)
	row := s.DB.QueryRow(`SELECT `+ticketCols+` FROM tickets WHERE track_hash=$1`, hash)
	t, err := scanTicket(row)
	if err == sql.ErrNoRows {
		return t, false
	}
	return t, err == nil
}

func (s *Server) setStatus(ticketID int64, status string, actorID *int64, actorKind, details string) {
	s.DB.Exec(`UPDATE tickets SET status=$1, updated_at=now() WHERE id=$2`, status, ticketID)
	s.audit(ticketID, actorID, actorKind, "status:"+status, details)
}

func (s *Server) touch(ticketID int64) {
	s.DB.Exec(`UPDATE tickets SET updated_at=now() WHERE id=$1`, ticketID)
}

func (s *Server) audit(ticketID int64, actorID *int64, actorKind, action, details string) {
	s.DB.Exec(`INSERT INTO audit_log (ticket_id, actor_staff_id, actor_kind, action, details) VALUES ($1,$2,$3,$4,$5)`,
		ticketID, actorID, actorKind, action, details)
}

// MultipartFiles возвращает файлы из поля files формы.
func (s *Server) MultipartFiles(r *http.Request) []*multipart.FileHeader {
	if r.MultipartForm == nil {
		return nil
	}
	return r.MultipartForm.File["files"]
}
