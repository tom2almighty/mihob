package hub

import (
	"net/http"
	"strings"

	"github.com/mihob/mihob/internal/acme"
	"github.com/mihob/mihob/internal/crypto"
	"github.com/mihob/mihob/internal/model"
)

func maskCertForAPI(c model.Certificate) model.Certificate {
	// Never leak private key PEM or ACME secret credentials in list responses
	c.Fingerprint = crypto.CertFingerprintSHA256(c.CertPEM)
	c.KeyPEM = ""
	if len(c.ACMECredentials) > 0 {
		masked := make(map[string]string, len(c.ACMECredentials))
		for k, v := range c.ACMECredentials {
			if len(v) > 4 {
				masked[k] = "****" + v[len(v)-4:]
			} else if v != "" {
				masked[k] = "****"
			}
		}
		c.ACMECredentials = masked
	}
	return c
}

func (s *Server) handleListCertificates(w http.ResponseWriter, r *http.Request) {
	list, err := s.store.ListCertificates()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]model.Certificate, 0, len(list))
	for _, c := range list {
		out = append(out, maskCertForAPI(c))
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleReorderCertificates(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IDs []int64 `json:"ids"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := s.store.ReorderCertificates(req.IDs); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleCreateCertificate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name            string            `json:"name"`
		Domain          string            `json:"domain"`
		SANs            []string          `json:"sans"`
		Source          string            `json:"source"` // "self_signed" | "manual" | "acme"
		ACMEProvider    string            `json:"acme_provider"`
		ACMEEmail       string            `json:"acme_email"`
		ACMECredentials map[string]string `json:"acme_credentials"`
		CertPEM         string            `json:"cert_pem"`
		KeyPEM          string            `json:"key_pem"`
		AutoRenew       bool              `json:"auto_renew"`
		ValidDays       int               `json:"valid_days"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Domain = strings.TrimSpace(req.Domain)
	if req.Name == "" {
		req.Name = req.Domain
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "证书名称不能为空")
		return
	}

	cert := &model.Certificate{
		Name:            strings.TrimSpace(req.Name),
		Domain:          req.Domain,
		SANs:            req.SANs,
		Source:          req.Source,
		ACMEProvider:    strings.TrimSpace(req.ACMEProvider),
		ACMEEmail:       strings.TrimSpace(req.ACMEEmail),
		ACMECredentials: req.ACMECredentials,
		AutoRenew:       req.AutoRenew,
	}

	switch req.Source {
	case "self_signed":
		if req.Domain == "" {
			writeError(w, http.StatusBadRequest, "域名或 IP 不能为空")
			return
		}
		cPEM, kPEM, nb, na, err := crypto.GenerateSelfSignedCert(req.Domain, req.SANs, req.ValidDays)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		cert.CertPEM = cPEM
		cert.KeyPEM = kPEM
		cert.Issuer = "mihob self-signed"
		cert.NotBefore = &nb
		cert.NotAfter = &na

	case "manual":
		if strings.TrimSpace(req.CertPEM) == "" || strings.TrimSpace(req.KeyPEM) == "" {
			writeError(w, http.StatusBadRequest, "请填写证书 PEM 与私钥 PEM")
			return
		}
		meta, err := crypto.ParseCertPEM(req.CertPEM, req.KeyPEM)
		if err != nil {
			writeError(w, http.StatusBadRequest, "证书格式无效: "+err.Error())
			return
		}
		cert.CertPEM = req.CertPEM
		cert.KeyPEM = req.KeyPEM
		if cert.Domain == "" {
			cert.Domain = meta.CommonName
		}
		if len(cert.SANs) == 0 {
			cert.SANs = meta.SANs
		}
		cert.Issuer = meta.Issuer
		cert.NotBefore = &meta.NotBefore
		cert.NotAfter = &meta.NotAfter

	case "acme":
		if req.Domain == "" {
			writeError(w, http.StatusBadRequest, "ACME 申请需要填写主域名")
			return
		}
		email := cert.ACMEEmail
		if email == "" {
			if st, err := s.store.GetSystemSettings(); err == nil {
				email = st.ACMEEmail
			}
		}
		if email == "" {
			writeError(w, http.StatusBadRequest, "请填写 ACME 联系邮箱或在系统设置中配置默认邮箱")
			return
		}
		cert.ACMEEmail = email
		res, err := s.acme.Issue(acme.IssueRequest{
			Domain:      cert.Domain,
			SANs:        cert.SANs,
			Email:       email,
			Provider:    cert.ACMEProvider,
			Credentials: cert.ACMECredentials,
		})
		if err != nil {
			writeError(w, http.StatusBadRequest, "ACME 签发失败: "+err.Error())
			return
		}
		cert.CertPEM = res.CertPEM
		cert.KeyPEM = res.KeyPEM
		cert.Issuer = res.Meta.Issuer
		cert.NotBefore = &res.Meta.NotBefore
		cert.NotAfter = &res.Meta.NotAfter

	default:
		writeError(w, http.StatusBadRequest, "不支持的证书来源")
		return
	}

	if err := s.store.CreateCertificate(cert); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, maskCertForAPI(*cert))
}

func (s *Server) handleRenewCertificate(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid certificate id")
		return
	}
	cert, err := s.store.GetCertificate(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "certificate not found")
		return
	}

	switch cert.Source {
	case "acme":
		res, err := s.acme.Issue(acme.IssueRequest{
			Domain:      cert.Domain,
			SANs:        cert.SANs,
			Email:       cert.ACMEEmail,
			Provider:    cert.ACMEProvider,
			Credentials: cert.ACMECredentials,
		})
		if err != nil {
			cert.LastError = err.Error()
			_ = s.store.UpdateCertificate(cert)
			writeError(w, http.StatusBadRequest, "ACME 续期失败: "+err.Error())
			return
		}
		cert.CertPEM = res.CertPEM
		cert.KeyPEM = res.KeyPEM
		cert.Issuer = res.Meta.Issuer
		cert.NotBefore = &res.Meta.NotBefore
		cert.NotAfter = &res.Meta.NotAfter
		cert.LastError = ""
	case "self_signed":
		cPEM, kPEM, nb, na, err := crypto.GenerateSelfSignedCert(cert.Domain, cert.SANs, 3650)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return
		}
		cert.CertPEM = cPEM
		cert.KeyPEM = kPEM
		cert.NotBefore = &nb
		cert.NotAfter = &na
		cert.LastError = ""
	default:
		writeError(w, http.StatusBadRequest, "手动上传的证书请重新上传替换")
		return
	}

	if err := s.store.UpdateCertificate(cert); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if nids, err := s.store.ListNodeIDsByCert(cert.ID); err == nil {
		s.ws.PushConfigToNodes(nids)
	}
	writeJSON(w, http.StatusOK, maskCertForAPI(*cert))
}

func (s *Server) handleDeleteCertificate(w http.ResponseWriter, r *http.Request) {
	id, err := parseIDParam(r, "id")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid certificate id")
		return
	}
	nids, _ := s.store.ListNodeIDsByCert(id)
	if err := s.store.DeleteCertificate(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	s.ws.PushConfigToNodes(nids)
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
