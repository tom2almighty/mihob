package db

import (
	"database/sql"
	"time"

	"github.com/mihob/mihob/internal/model"
)

func (s *Store) ListRuleSets() ([]model.RuleSet, error) {
	rows, err := s.db.Query(`
		SELECT id, name, behavior, description, rules_text, rule_count, mrs_size, compiled_at, last_error, created_at, updated_at
		FROM rule_sets
		ORDER BY id DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []model.RuleSet{}
	for rows.Next() {
		var (
			rs         model.RuleSet
			compiledAt sql.NullTime
		)
		if err := rows.Scan(
			&rs.ID, &rs.Name, &rs.Behavior, &rs.Description, &rs.RulesText,
			&rs.RuleCount, &rs.MRSSize, &compiledAt, &rs.LastError, &rs.CreatedAt, &rs.UpdatedAt,
		); err != nil {
			return nil, err
		}
		if compiledAt.Valid {
			t := compiledAt.Time
			rs.CompiledAt = &t
		}
		out = append(out, rs)
	}
	return out, rows.Err()
}

func (s *Store) GetRuleSet(id int64) (*model.RuleSet, error) {
	var (
		rs         model.RuleSet
		compiledAt sql.NullTime
	)
	err := s.db.QueryRow(`
		SELECT id, name, behavior, description, rules_text, rule_count, mrs_size, compiled_at, last_error, created_at, updated_at
		FROM rule_sets WHERE id = ?
	`, id).Scan(
		&rs.ID, &rs.Name, &rs.Behavior, &rs.Description, &rs.RulesText,
		&rs.RuleCount, &rs.MRSSize, &compiledAt, &rs.LastError, &rs.CreatedAt, &rs.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if compiledAt.Valid {
		t := compiledAt.Time
		rs.CompiledAt = &t
	}
	return &rs, nil
}

func (s *Store) GetRuleSetByName(name string) (*model.RuleSet, error) {
	var (
		rs         model.RuleSet
		compiledAt sql.NullTime
	)
	err := s.db.QueryRow(`
		SELECT id, name, behavior, description, rules_text, rule_count, mrs_size, compiled_at, last_error, created_at, updated_at
		FROM rule_sets WHERE name = ?
	`, name).Scan(
		&rs.ID, &rs.Name, &rs.Behavior, &rs.Description, &rs.RulesText,
		&rs.RuleCount, &rs.MRSSize, &compiledAt, &rs.LastError, &rs.CreatedAt, &rs.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if compiledAt.Valid {
		t := compiledAt.Time
		rs.CompiledAt = &t
	}
	return &rs, nil
}

func (s *Store) CreateRuleSet(rs *model.RuleSet) error {
	now := time.Now().UTC()
	rs.CreatedAt = now
	rs.UpdatedAt = now
	res, err := s.db.Exec(`
		INSERT INTO rule_sets(name, behavior, description, rules_text, rule_count, mrs_size, compiled_at, last_error, created_at, updated_at)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, rs.Name, rs.Behavior, rs.Description, rs.RulesText, rs.RuleCount, rs.MRSSize, rs.CompiledAt, rs.LastError, rs.CreatedAt, rs.UpdatedAt)
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	rs.ID = id
	return nil
}

func (s *Store) UpdateRuleSet(rs *model.RuleSet) error {
	rs.UpdatedAt = time.Now().UTC()
	_, err := s.db.Exec(`
		UPDATE rule_sets
		SET name = ?, behavior = ?, description = ?, rules_text = ?, rule_count = ?, mrs_size = ?, compiled_at = ?, last_error = ?, updated_at = ?
		WHERE id = ?
	`, rs.Name, rs.Behavior, rs.Description, rs.RulesText, rs.RuleCount, rs.MRSSize, rs.CompiledAt, rs.LastError, rs.UpdatedAt, rs.ID)
	return err
}

func (s *Store) DeleteRuleSet(id int64) error {
	_, err := s.db.Exec(`DELETE FROM rule_sets WHERE id = ?`, id)
	return err
}
