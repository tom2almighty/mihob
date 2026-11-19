package db

import (
	"database/sql"
	"encoding/json"
	"time"

	"github.com/mihob/mihob/internal/model"
)

func scanCert(row interface{ Scan(...any) error }) (*model.Certificate, error) {
	var c model.Certificate
	var sansJSON, credsJSON string
	var notBefore, notAfter sql.NullTime
	var autoRenew int
	err := row.Scan(
		&c.ID, &c.Name, &c.Domain, &sansJSON, &c.Source,
		&c.ACMEProvider, &c.ACMEEmail, &credsJSON,
		&c.CertPEM, &c.KeyPEM, &c.Issuer, &notBefore, &notAfter,
		&autoRenew, &c.LastError, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal([]byte(sansJSON), &c.SANs)
	if c.SANs == nil {
		c.SANs = []string{}
	}
	_ = json.Unmarshal([]byte(credsJSON), &c.ACMECredentials)
	if notBefore.Valid {
		t := notBefore.Time
		c.NotBefore = &t
	}
	if notAfter.Valid {
		t := notAfter.Time
		c.NotAfter = &t
	}
	c.AutoRenew = autoRenew == 1
	return &c, nil
}

const certSelectSQL = `
SELECT id, name, domain, sans, source, acme_provider, acme_email, acme_credentials,
       cert_pem, key_pem, issuer, not_before, not_after, auto_renew, last_error, created_at, updated_at
FROM certificates
`

func (s *Store) ListCertificates() ([]model.Certificate, error) {
	rows, err := s.db.Query(certSelectSQL + ` ORDER BY id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.Certificate{}
	for rows.Next() {
		c, err := scanCert(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *c)
	}
	return out, rows.Err()
}

func (s *Store) GetCertificate(id int64) (*model.Certificate, error) {
	return scanCert(s.db.QueryRow(certSelectSQL+` WHERE id = ?`, id))
}

func (s *Store) CreateCertificate(c *model.Certificate) error {
	now := time.Now().UTC()
	sansJSON, _ := json.Marshal(c.SANs)
	credsJSON, _ := json.Marshal(c.ACMECredentials)
	if c.ACMECredentials == nil {
		credsJSON = []byte("{}")
	}
	res, err := s.db.Exec(
		`INSERT INTO certificates(name, domain, sans, source, acme_provider, acme_email, acme_credentials,
		 cert_pem, key_pem, issuer, not_before, not_after, auto_renew, last_error, created_at, updated_at)
		 VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		c.Name, c.Domain, string(sansJSON), c.Source, c.ACMEProvider, c.ACMEEmail, string(credsJSON),
		c.CertPEM, c.KeyPEM, c.Issuer, c.NotBefore, c.NotAfter, boolToInt(c.AutoRenew), c.LastError, now, now,
	)
	if err != nil {
		return err
	}
	c.ID, _ = res.LastInsertId()
	c.CreatedAt = now
	c.UpdatedAt = now
	return nil
}

func (s *Store) UpdateCertificate(c *model.Certificate) error {
	sansJSON, _ := json.Marshal(c.SANs)
	credsJSON, _ := json.Marshal(c.ACMECredentials)
	if c.ACMECredentials == nil {
		credsJSON = []byte("{}")
	}
	_, err := s.db.Exec(
		`UPDATE certificates SET name=?, domain=?, sans=?, source=?, acme_provider=?, acme_email=?, acme_credentials=?,
		 cert_pem=?, key_pem=?, issuer=?, not_before=?, not_after=?, auto_renew=?, last_error=?, updated_at=?
		 WHERE id=?`,
		c.Name, c.Domain, string(sansJSON), c.Source, c.ACMEProvider, c.ACMEEmail, string(credsJSON),
		c.CertPEM, c.KeyPEM, c.Issuer, c.NotBefore, c.NotAfter, boolToInt(c.AutoRenew), c.LastError, time.Now().UTC(), c.ID,
	)
	return err
}

func (s *Store) DeleteCertificate(id int64) error {
	_, err := s.db.Exec(`DELETE FROM certificates WHERE id = ?`, id)
	return err
}

func (s *Store) ListAutoRenewCerts(before time.Time) ([]model.Certificate, error) {
	rows, err := s.db.Query(
		certSelectSQL+` WHERE source = 'acme' AND auto_renew = 1 AND (not_after IS NULL OR not_after <= ?)`,
		before,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.Certificate{}
	for rows.Next() {
		c, err := scanCert(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *c)
	}
	return out, rows.Err()
}
